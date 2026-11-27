use super::{Settings, hash, hex};
use ring::rand::{SecureRandom, SystemRandom};
use serde::Serialize;
use std::{future::Future, io, process::Stdio, time::Duration};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::Command,
    time::timeout,
};

const CONTROL_TIMEOUT: Duration = Duration::from_secs(10);
const JOB_TIMEOUT: Duration = Duration::from_secs(45);
const OUTPUT_LIMIT: usize = 64 * 1024;
const WORKSPACE: &str = "/home/node";

pub(super) enum Error {
    Backend,
    Revoked,
    Timeout,
}

#[derive(Serialize)]
pub(super) struct Output {
    exit_code: i32,
    stdout: String,
    stderr: String,
    truncated: bool,
}

fn docker(settings: &Settings) -> Command {
    let mut socket = std::ffi::OsString::from("unix://");
    socket.push(&settings.docker_socket);
    let mut command = Command::new("/usr/bin/docker");
    command
        .env_clear()
        .args([
            "--config",
            "/nonexistent/bapx-sandbox-docker-config",
            "--host",
        ])
        .arg(socket)
        .stdin(Stdio::null())
        .kill_on_drop(true);
    command
}

async fn control(command: &mut Command) -> bool {
    command.stdout(Stdio::null()).stderr(Stdio::null());
    timeout(CONTROL_TIMEOUT, command.status())
        .await
        .is_ok_and(|status| status.is_ok_and(|status| status.success()))
}

async fn inspect(command: &mut Command) -> Option<String> {
    let output = timeout(CONTROL_TIMEOUT, command.output())
        .await
        .ok()?
        .ok()?;
    let stdout = String::from_utf8(output.stdout).ok()?;
    output.status.success().then(|| stdout.trim().to_owned())
}

pub(super) async fn verify_image(settings: &Settings) -> io::Result<()> {
    let layout = inspect(docker(settings).args([
        "image",
        "inspect",
        "--format",
        "{{.Os}}:{{len .Config.Volumes}}",
        &settings.image,
    ]))
    .await;
    if layout.as_deref() == Some("linux:0") {
        Ok(())
    } else {
        Err(io::Error::other(
            "sandbox image must be local, Linux, and declare no writable volumes",
        ))
    }
}

fn volume_name(installation: &str, business: &str, project: &str) -> String {
    // The validated IDs exclude NUL. Installation IDs must stay unique per worker.
    let key = [installation, business, project].join("\0");
    format!("bapx-workspace-{}", hash(key.as_bytes()))
}

fn labels(settings: &Settings, business: &str, project: &str) -> [String; 3] {
    [
        format!("com.bapx.sandbox.installation={}", settings.installation),
        format!("com.bapx.sandbox.business={business}"),
        format!("com.bapx.sandbox.project={project}"),
    ]
}

pub(super) async fn execute(
    settings: &Settings,
    business: &str,
    project: &str,
    argv: &[String],
    revoked: impl Future<Output = ()>,
) -> Result<Output, Error> {
    let volume = volume_name(&settings.installation, business, project);
    let labels = labels(settings, business, project);
    let mut create_volume = docker(settings);
    create_volume.args(["volume", "create", "--driver=local"]);
    for label in &labels {
        create_volume.args(["--label", label]);
    }
    if !control(create_volume.arg(&volume)).await {
        return Err(Error::Backend);
    }
    let layout = inspect(docker(settings).args([
        "volume",
        "inspect",
        "--format",
        concat!(
            "{{.Driver}}:{{len .Options}}:",
            "{{index .Labels \"com.bapx.sandbox.installation\"}}:",
            "{{index .Labels \"com.bapx.sandbox.business\"}}:",
            "{{index .Labels \"com.bapx.sandbox.project\"}}",
        ),
        &volume,
    ]))
    .await;
    if layout.as_deref()
        != Some(&format!(
            "local:0:{}:{business}:{project}",
            settings.installation
        ))
    {
        return Err(Error::Backend);
    }

    let mut random = [0; 16];
    SystemRandom::new()
        .fill(&mut random)
        .map_err(|_| Error::Backend)?;
    let name = format!("bapx-job-{}", hex(&random));
    let mount = format!("type=volume,source={volume},target={WORKSPACE}");
    let mut create = docker(settings);
    create.args(["container", "create", "--name", &name]);
    for label in &labels {
        create.args(["--label", label]);
    }
    create
        .args([
            "--pull=never",
            "--user=1000:1000",
            "--read-only",
            "--network=none",
            "--ipc=private",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--cpus=1",
            "--memory=256m",
            "--memory-swap=256m",
            "--pids-limit=64",
            "--log-driver=none",
            "--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=64m,mode=1777",
            "--mount",
            &mount,
            "--workdir",
            WORKSPACE,
            "--entrypoint=/bin/sh",
            &settings.image,
            "-c",
            "exec /usr/bin/env -i HOME=/tmp TMPDIR=/tmp PATH=/usr/local/bin:/usr/bin:/bin \"$@\"",
            "sandbox",
        ])
        .args(argv);
    if control(&mut create).await {
        let output = tokio::select! {
            biased;
            _ = revoked => Err(Error::Revoked),
            result = start(settings, &name) => result,
        };
        if !control(docker(settings).args(["container", "rm", "--force", &name])).await {
            eprintln!("sandbox worker could not remove container {name}");
            return Err(Error::Backend);
        }
        output
    } else {
        // The daemon could have processed the create even if its client timed out.
        let _ = control(docker(settings).args(["container", "rm", "--force", &name])).await;
        Err(Error::Backend)
    }
}

async fn start(settings: &Settings, name: &str) -> Result<Output, Error> {
    let mut child = docker(settings)
        .args(["container", "start", "--attach", name])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| Error::Backend)?;
    let stdout = child.stdout.take().expect("stdout is piped");
    let stderr = child.stderr.take().expect("stderr is piped");
    let (status, (stdout, stdout_truncated), (stderr, stderr_truncated)) =
        timeout(JOB_TIMEOUT, async {
            tokio::try_join!(child.wait(), bounded(stdout), bounded(stderr))
        })
        .await
        .map_err(|_| Error::Timeout)?
        .map_err(|_| Error::Backend)?;
    let exit_code = status.code().ok_or(Error::Backend)?;
    if exit_code == 125 {
        // The CLI can also use 125 for its own errors.
        let state = inspect(docker(settings).args([
            "container",
            "inspect",
            "--format",
            "{{.State.Status}}:{{.State.ExitCode}}:{{.State.Error}}",
            name,
        ]))
        .await;
        if state.as_deref() != Some("exited:125:") {
            return Err(Error::Backend);
        }
    }
    Ok(Output {
        exit_code,
        stdout: String::from_utf8_lossy(&stdout).into_owned(),
        stderr: String::from_utf8_lossy(&stderr).into_owned(),
        truncated: stdout_truncated || stderr_truncated,
    })
}

async fn bounded(mut stream: impl AsyncRead + Unpin) -> io::Result<(Vec<u8>, bool)> {
    let mut buffer = [0; 8192];
    let mut output = Vec::new();
    let mut truncated = false;
    loop {
        let count = stream.read(&mut buffer).await?;
        if count == 0 {
            return Ok((output, truncated));
        }
        let keep = count.min(OUTPUT_LIMIT - output.len());
        output.extend_from_slice(&buffer[..keep]);
        truncated |= keep < count;
    }
}
