//! Opt-in device access for one protected, dedicated Linux Core.
use axum::body::{Body, BodyDataStream, Bytes};
use axum::http::Method;
use ring::digest;
use serde::Deserialize;
use std::{
    collections::BTreeMap,
    env,
    fs::{self, OpenOptions},
    future::Future,
    io::{self, Read},
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Semaphore;
use tokio_stream::Stream;

const TOKEN_PREFIX: &str = "bapx-device-v1.";
const MAX_POLICY_BYTES: u64 = 64 * 1024;
const MAX_GRANTS: usize = 128;
const MAX_LIFETIME_SECONDS: u64 = 8 * 60 * 60;
const REVOCATION_INTERVAL: Duration = Duration::from_millis(500);

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct Binding {
    core_id: String,
    workspace_id: String,
    account_id: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Grant {
    issued_at: u64,
    expires_at: u64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Registry {
    version: u8,
    binding: Binding,
    grants: BTreeMap<String, Grant>,
}

pub(crate) struct DeviceAccess {
    path: PathBuf,
    binding: Binding,
    reads: Arc<Semaphore>,
}

pub(super) struct DeviceLease {
    access: Arc<DeviceAccess>,
    digest: String,
}

impl DeviceAccess {
    pub(crate) fn from_env(config: &crate::config::Config) -> io::Result<Option<Arc<Self>>> {
        let Some(path) = env::var_os("BAPX_CORE_DEVICE_ACCESS_FILE") else {
            return Ok(None);
        };
        if !cfg!(target_os = "linux")
            || !config.listen.ip().is_loopback()
            || config.storage.is_none()
            || config.api_url.is_some()
        {
            return Err(invalid(
                "Device access needs a protected Linux Core with private loopback ingress and local history",
            ));
        }
        Self::open(PathBuf::from(path)).map(Some)
    }

    fn open(path: PathBuf) -> io::Result<Arc<Self>> {
        if !path.is_absolute() || path.canonicalize()? != path {
            return Err(invalid(
                "Device registry must use a canonical absolute path",
            ));
        }
        let binding = read_registry(&path)?.binding;
        Ok(Arc::new(Self {
            path,
            binding,
            reads: Arc::new(Semaphore::new(8)),
        }))
    }

    pub(super) async fn authenticate(self: &Arc<Self>, token: &str) -> Option<DeviceLease> {
        let suffix = token.strip_prefix(TOKEN_PREFIX)?;
        if !hex_digest(suffix) {
            return None;
        }
        let digest = digest::digest(&digest::SHA256, token.as_bytes())
            .as_ref()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        let lease = DeviceLease {
            access: Arc::clone(self),
            digest,
        };
        lease.valid().await.then_some(lease)
    }
}

impl DeviceLease {
    async fn valid(&self) -> bool {
        let Ok(permit) = Arc::clone(&self.access.reads).try_acquire_owned() else {
            return false;
        };
        let access = Arc::clone(&self.access);
        let digest = self.digest.clone();
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            let Ok(registry) = read_registry(&access.path) else {
                return false;
            };
            let Ok(now) = SystemTime::now().duration_since(UNIX_EPOCH) else {
                return false;
            };
            let now = now.as_secs();
            registry.binding == access.binding
                && registry
                    .grants
                    .get(&digest)
                    .is_some_and(|grant| grant.issued_at <= now && now < grant.expires_at)
        })
        .await
        .unwrap_or(false)
    }

    pub(super) fn guard_events(self, body: Body) -> Body {
        let revoked = Box::pin(async move {
            loop {
                if !self.valid().await {
                    return;
                }
                tokio::time::sleep(REVOCATION_INTERVAL).await;
            }
        });
        Body::from_stream(RevocableEvents {
            body: body.into_data_stream(),
            revoked,
        })
    }
}

struct RevocableEvents {
    body: BodyDataStream,
    revoked: Pin<Box<dyn Future<Output = ()> + Send>>,
}

impl Stream for RevocableEvents {
    type Item = Result<Bytes, axum::Error>;

    fn poll_next(mut self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if self.revoked.as_mut().poll(context).is_ready() {
            return Poll::Ready(None);
        }
        Pin::new(&mut self.body).poll_next(context)
    }
}

pub(super) fn allows(method: &Method, route: &str) -> bool {
    match *method {
        Method::GET => matches!(
            route,
            "/v1/health"
                | "/v1/ready"
                | "/v1/capabilities"
                | "/v1/dashboard"
                | "/v1/sessions"
                | "/v1/sessions/{id}"
                | "/v1/sessions/{id}/requests/{request}"
                | "/v1/sessions/{id}/workspace"
                | "/v1/sessions/{id}/events"
                | "/v1/sessions/{id}/stream"
        ),
        Method::POST => matches!(
            route,
            "/v1/sessions"
                | "/v1/sessions/{id}/prompts"
                | "/v1/sessions/{id}/interrupt"
                | "/v1/sessions/{id}/stop"
        ),
        _ => false,
    }
}

fn read_registry(path: &Path) -> io::Result<Registry> {
    let directory =
        fs::symlink_metadata(path.parent().ok_or(invalid("Missing registry directory"))?)?;
    if !directory.is_dir() || directory.permissions().mode() & 0o022 != 0 {
        return Err(invalid(
            "Device registry directory must not be writable by others",
        ));
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options.open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file()
        || metadata.permissions().mode() & 0o137 != 0
        || metadata.len() > MAX_POLICY_BYTES
    {
        return Err(invalid("Device registry must be a bounded private file"));
    }
    let mut bytes = Vec::new();
    file.take(MAX_POLICY_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_POLICY_BYTES {
        return Err(invalid("Device registry exceeds its size limit"));
    }
    let registry: Registry = serde_json::from_slice(&bytes)?;
    if registry.version != 1
        || !route_id(&registry.binding.core_id)
        || !route_id(&registry.binding.workspace_id)
        || !member_id(&registry.binding.account_id)
        || registry.grants.len() > MAX_GRANTS
        || registry.grants.iter().any(|(digest, grant)| {
            !hex_digest(digest)
                || !matches!(
                    grant.expires_at.checked_sub(grant.issued_at),
                    Some(1..=MAX_LIFETIME_SECONDS)
                )
        })
    {
        return Err(invalid("Invalid device registry"));
    }
    Ok(registry)
}

fn hex_digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(lower_hex)
}

fn lower_hex(byte: u8) -> bool {
    byte.is_ascii_digit() || matches!(byte, b'a'..=b'f')
}

fn member_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && bytes[14] == b'4'
        && matches!(bytes[19], b'8' | b'9' | b'a' | b'b')
        && bytes.iter().enumerate().all(|(i, byte)| {
            if matches!(i, 8 | 13 | 18 | 23) {
                *byte == b'-'
            } else {
                lower_hex(*byte)
            }
        })
}

fn route_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn invalid(message: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

#[cfg(test)]
#[path = "device_access_tests.rs"]
mod tests;
