//! Opt-in business workspace pilot. Neither the private Core nor public web router mounts it.
mod runner;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path as RoutePath, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use ring::digest;
use serde::Deserialize;
use serde_json::json;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::OpenOptions,
    io::{self, Read},
    net::SocketAddr,
    os::unix::fs::{FileTypeExt, MetadataExt, OpenOptionsExt},
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tokio::{net::TcpListener, sync::Semaphore, time::sleep};

const MAX_POLICY: usize = 128 * 1024;
const MAX_REQUEST: usize = 16 * 1024;
const GRANT_CHECK_INTERVAL: Duration = Duration::from_secs(1);

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct Settings {
    installation: String,
    listen: SocketAddr,
    image: String,
    docker_socket: PathBuf,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Policy {
    settings: Settings,
    accounts: BTreeMap<String, String>,
    businesses: BTreeMap<String, Business>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Business {
    members: BTreeSet<String>,
    projects: BTreeMap<String, Project>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Project {
    members: BTreeSet<String>,
}

struct Service {
    policy_file: PathBuf,
    settings: Settings,
    jobs: Arc<Semaphore>,
}

struct Grant {
    account: String,
    token_hash: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Job {
    argv: Vec<String>,
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn id(value: &str) -> bool {
    let valid = |byte: u8| byte.is_ascii_lowercase() || byte.is_ascii_digit();
    value.len() <= 64
        && value.bytes().next().is_some_and(valid)
        && value.bytes().all(|byte| valid(byte) || byte == b'-')
}

fn is_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        write!(output, "{byte:02x}").expect("writing into a string cannot fail");
    }
    output
}

fn hash(bytes: &[u8]) -> String {
    hex(digest::digest(&digest::SHA256, bytes).as_ref())
}

impl Policy {
    fn read(path: &Path) -> io::Result<Self> {
        let file = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
            .open(path)?;
        let metadata = file.metadata()?;
        // SAFETY: geteuid does not take any pointers or modify process state.
        let euid = unsafe { libc::geteuid() };
        if !metadata.is_file() || metadata.uid() != euid || metadata.mode() & 0o077 != 0 {
            return Err(invalid(
                "sandbox policy must be a private file owned by the service user",
            ));
        }
        let mut bytes = Vec::new();
        file.take((MAX_POLICY + 1) as u64).read_to_end(&mut bytes)?;
        if bytes.len() > MAX_POLICY {
            return Err(invalid("sandbox policy exceeds the size limit"));
        }
        let policy: Self = serde_json::from_slice(&bytes)?;
        policy.validate()?;
        Ok(policy)
    }

    fn validate(&self) -> io::Result<()> {
        if !id(&self.settings.installation)
            || !self.settings.listen.ip().is_loopback()
            || !self
                .settings
                .image
                .strip_prefix("sha256:")
                .is_some_and(is_digest)
            || !self.settings.docker_socket.is_absolute()
        {
            return Err(invalid("invalid sandbox settings"));
        }
        let mut hashes = BTreeSet::new();
        if !self
            .accounts
            .iter()
            .all(|(key, token)| id(key) && is_digest(token) && hashes.insert(token))
        {
            return Err(invalid("invalid or repeated sandbox account credentials"));
        }
        let known_members = |members: &BTreeSet<String>| {
            members
                .iter()
                .all(|member| self.accounts.contains_key(member))
        };
        for (key, business) in &self.businesses {
            if !id(key)
                || !known_members(&business.members)
                || !business
                    .projects
                    .iter()
                    .all(|(key, project)| id(key) && known_members(&project.members))
            {
                return Err(invalid("invalid sandbox business or project membership"));
            }
        }
        Ok(())
    }

    fn authorize(
        &self,
        headers: &HeaderMap,
        business: &str,
        project: &str,
    ) -> Result<Grant, StatusCode> {
        let token = headers
            .get(header::AUTHORIZATION)
            .and_then(|header| header.to_str().ok())
            .and_then(|header| header.strip_prefix("Bearer "))
            .filter(|token| is_digest(token))
            .ok_or(StatusCode::UNAUTHORIZED)?;
        let token_hash = hash(token.as_bytes());
        let account = self
            .accounts
            .iter()
            .find(|(_, expected)| crate::api::same_token(&token_hash, expected))
            .map(|(account, _)| account)
            .ok_or(StatusCode::UNAUTHORIZED)?;
        if !self.allows(account, business, project) {
            return Err(StatusCode::NOT_FOUND);
        }
        Ok(Grant {
            account: account.clone(),
            token_hash,
        })
    }

    fn allows(&self, account: &str, business: &str, project: &str) -> bool {
        self.businesses.get(business).is_some_and(|business| {
            business.members.contains(account)
                && business
                    .projects
                    .get(project)
                    .is_some_and(|project| project.members.contains(account))
        })
    }
}

impl Service {
    fn grant_is_current(&self, grant: &Grant, business: &str, project: &str) -> bool {
        Policy::read(&self.policy_file).is_ok_and(|policy| {
            policy.settings == self.settings
                && policy
                    .accounts
                    .get(&grant.account)
                    .is_some_and(|expected| crate::api::same_token(&grant.token_hash, expected))
                && policy.allows(&grant.account, business, project)
        })
    }
}

impl Job {
    fn valid(&self) -> bool {
        self.argv.first().is_some_and(|name| !name.is_empty())
            && self.argv.len() <= 64
            && self.argv.iter().map(String::len).sum::<usize>() <= 8192
            && self.argv.iter().all(|arg| !arg.contains('\0'))
    }
}

fn failure(status: StatusCode) -> Response {
    let message = match status {
        StatusCode::UNAUTHORIZED => "unauthorized",
        StatusCode::NOT_FOUND => "project not found",
        StatusCode::BAD_REQUEST => "invalid command",
        StatusCode::TOO_MANY_REQUESTS => "sandbox runner busy",
        StatusCode::GATEWAY_TIMEOUT => "sandbox job timed out",
        _ => "sandbox runner unavailable",
    };
    let mut response = (status, Json(json!({"error": message}))).into_response();
    if status == StatusCode::UNAUTHORIZED {
        response
            .headers_mut()
            .insert(header::WWW_AUTHENTICATE, "Bearer".parse().unwrap());
    }
    response
}

async fn run_job(
    State(service): State<Arc<Service>>,
    RoutePath((business, project)): RoutePath<(String, String)>,
    headers: HeaderMap,
    Json(job): Json<Job>,
) -> Response {
    let policy = match Policy::read(&service.policy_file) {
        Ok(policy) if policy.settings == service.settings => policy,
        _ => return failure(StatusCode::SERVICE_UNAVAILABLE),
    };
    let grant = match policy.authorize(&headers, &business, &project) {
        Ok(grant) => grant,
        Err(status) => return failure(status),
    };
    if !job.valid() {
        return failure(StatusCode::BAD_REQUEST);
    }
    let Ok(permit) = Arc::clone(&service.jobs).try_acquire_owned() else {
        return failure(StatusCode::TOO_MANY_REQUESTS);
    };
    eprintln!(
        "sandbox job accepted for account {}, business {business}, project {project}",
        grant.account
    );
    // Finish a bounded job and remove its container even when the HTTP caller disconnects.
    let task = tokio::spawn(async move {
        let _permit = permit;
        let revoked = async {
            while service.grant_is_current(&grant, &business, &project) {
                sleep(GRANT_CHECK_INTERVAL).await;
            }
        };
        let output =
            runner::execute(&service.settings, &business, &project, &job.argv, revoked).await?;
        if !service.grant_is_current(&grant, &business, &project) {
            return Err(runner::Error::Revoked);
        }
        Ok(output)
    });
    match task.await {
        Ok(Ok(output)) => ([(header::CACHE_CONTROL, "no-store")], Json(output)).into_response(),
        Ok(Err(runner::Error::Revoked)) => failure(StatusCode::NOT_FOUND),
        Ok(Err(runner::Error::Timeout)) => failure(StatusCode::GATEWAY_TIMEOUT),
        _ => failure(StatusCode::SERVICE_UNAVAILABLE),
    }
}

pub async fn serve(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let policy_file = std::path::absolute(path)?;
    let Policy { settings, .. } = Policy::read(&policy_file)?;
    if !settings.docker_socket.metadata()?.file_type().is_socket() {
        return Err(invalid("sandbox runner requires a local Docker socket").into());
    }
    runner::verify_image(&settings).await?;
    let listener = TcpListener::bind(settings.listen).await?;
    let jobs = Arc::new(Semaphore::new(2));
    let state = Arc::new(Service {
        policy_file,
        settings,
        jobs: Arc::clone(&jobs),
    });
    let app = Router::new()
        .route(
            "/healthz",
            get(|| async { Json(json!({"service":"bapx-business-sandbox"})) }),
        )
        .route(
            "/v1/businesses/{business}/projects/{project}/run",
            post(run_job),
        )
        .layer(DefaultBodyLimit::max(MAX_REQUEST))
        .with_state(state);
    eprintln!(
        "bapx-business-sandbox listening on {}",
        listener.local_addr()?
    );
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let mut terminate =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                    .expect("install sandbox termination signal");
            tokio::select! {
                _ = tokio::signal::ctrl_c() => {}
                _ = terminate.recv() => {}
            }
        })
        .await?;
    // A client may already have disconnected from a still-running job.
    let _drained = jobs.acquire_many(2).await?;
    Ok(())
}
