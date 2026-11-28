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
    os::unix::fs::MetadataExt,
    path::{Path, PathBuf},
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Semaphore;
use tokio_stream::Stream;

const STATE_BINDING_FILE: &str = "device-owner.json";
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
    owner: FileTrust,
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
        let owner = FileTrust::for_core(config)?;
        let access = Self::open(PathBuf::from(path), owner)?;
        access.verify_state_binding(&config.state_dir, config.instance.as_deref())?;
        Ok(Some(access))
    }

    fn open(path: PathBuf, owner: FileTrust) -> io::Result<Arc<Self>> {
        let binding = read_registry(&path, owner)?.binding;
        Ok(Arc::new(Self {
            path,
            binding,
            owner,
            reads: Arc::new(Semaphore::new(8)),
        }))
    }

    fn verify_state_binding(&self, state_dir: &Path, instance: Option<&str>) -> io::Result<()> {
        let bytes = self
            .owner
            .read_private(&state_dir.join(STATE_BINDING_FILE))?;
        let sealed_owner: Binding = serde_json::from_slice(&bytes)?;
        if instance != Some(self.binding.core_id.as_str()) || sealed_owner != self.binding {
            return Err(invalid(
                "Device registry does not match this Core's saved owner",
            ));
        }
        Ok(())
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
    pub(super) fn workspace(&self) -> &str {
        &self.access.binding.workspace_id
    }

    async fn valid(&self) -> bool {
        let Ok(permit) = Arc::clone(&self.access.reads).try_acquire_owned() else {
            return false;
        };
        let access = Arc::clone(&self.access);
        let digest = self.digest.clone();
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            let Ok(registry) = read_registry(&access.path, access.owner) else {
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

#[derive(Clone, Copy)]
struct FileTrust {
    service_uid: u32,
    agent_uid: u32,
}

impl FileTrust {
    #[cfg(target_os = "linux")]
    fn for_core(config: &crate::config::Config) -> io::Result<Self> {
        let policy = config
            .storage
            .as_ref()
            .ok_or(invalid("Device access requires protected storage"))?;
        // SAFETY: geteuid has no arguments or mutable state.
        let service_uid = unsafe { libc::geteuid() };
        if !config.listen.ip().is_loopback()
            || config.api_url.is_some()
            || policy.agent_sudo
            || policy.container()
            || service_uid == policy.agent_uid
        {
            return Err(invalid(
                "Device access requires protected Linux loopback, local history and a separate workload UID without sudo",
            ));
        }
        Ok(Self {
            service_uid,
            agent_uid: policy.agent_uid,
        })
    }

    #[cfg(not(target_os = "linux"))]
    fn for_core(_config: &crate::config::Config) -> io::Result<Self> {
        Err(invalid("Device access requires Linux"))
    }

    fn trusted_owner(self, uid: u32) -> bool {
        uid != self.agent_uid && (uid == 0 || uid == self.service_uid)
    }

    fn read_private(self, path: &Path) -> io::Result<Vec<u8>> {
        if !path.is_absolute() || path.canonicalize()? != path {
            return Err(invalid(
                "Device access files require a canonical absolute path",
            ));
        }
        let directory = path
            .parent()
            .ok_or(invalid("Missing device access directory"))?;
        for part in directory.ancestors() {
            let metadata = fs::symlink_metadata(part)?;
            if !metadata.is_dir()
                || !self.trusted_owner(metadata.uid())
                || metadata.mode() & 0o022 != 0
            {
                return Err(invalid(
                    "Device access requires protected ancestor directories",
                ));
            }
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
            || !self.trusted_owner(metadata.uid())
            || metadata.mode() & 0o177 != 0
            || metadata.len() > MAX_POLICY_BYTES
        {
            return Err(invalid(
                "Device access policy must be a bounded owner-only file",
            ));
        }
        let mut bytes = Vec::new();
        file.take(MAX_POLICY_BYTES + 1).read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_POLICY_BYTES {
            return Err(invalid("Device access policy exceeds its size limit"));
        }
        Ok(bytes)
    }
}

fn read_registry(path: &Path, owner: FileTrust) -> io::Result<Registry> {
    let bytes = owner.read_private(path)?;
    let registry: Registry = serde_json::from_slice(&bytes)?;
    if registry.version != 1
        || registry.binding.core_id.is_empty()
        || registry.binding.core_id.len() > 63
        || !registry
            .binding
            .core_id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        || !route_id(&registry.binding.workspace_id)
        || matches!(registry.binding.workspace_id.as_str(), "root" | "legacy")
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

#[cfg(all(test, target_os = "linux"))]
#[path = "device_access_tests.rs"]
mod tests;
