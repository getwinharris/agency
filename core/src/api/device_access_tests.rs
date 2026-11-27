use super::*;
use axum::body::Bytes;
use ring::rand::{SecureRandom, SystemRandom};
use serde_json::{Value, json};
use std::{io::Write, os::unix::fs::OpenOptionsExt};
use tokio_stream::{StreamExt, wrappers::ReceiverStream};

const ACCOUNT: &str = "0890b410-a341-4c01-a94d-c4b219cba0db";

struct Fixture {
    directory: PathBuf,
    token: String,
}

impl Fixture {
    fn new() -> Self {
        let mut entropy = [0; 32];
        SystemRandom::new().fill(&mut entropy).unwrap();
        let suffix: String = entropy.iter().map(|byte| format!("{byte:02x}")).collect();
        let directory = env::temp_dir().join(format!("bapx-device-test-{}", &suffix[..16]));
        fs::create_dir(&directory).unwrap();
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).unwrap();
        Self {
            directory: directory.canonicalize().unwrap(),
            token: format!("{TOKEN_PREFIX}{suffix}"),
        }
    }

    fn registry(&self, workspace: &str, grant: Option<(u64, u64)>) -> PathBuf {
        let grants = match grant {
            Some((issued_at, expires_at)) => {
                let token_digest: String = digest::digest(&digest::SHA256, self.token.as_bytes())
                    .as_ref()
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect();
                json!({(token_digest): {"issued_at": issued_at, "expires_at": expires_at}})
            }
            None => json!({}),
        };
        let policy: Value = json!({
            "version": 1,
            "binding": {"core_id": "core-test", "workspace_id": workspace, "account_id": ACCOUNT},
            "grants": grants,
        });
        let path = self.directory.join("devices.json");
        let replacement = self.directory.join("replacement.json");
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&replacement)
            .unwrap();
        file.write_all(&serde_json::to_vec(&policy).unwrap())
            .unwrap();
        drop(file);
        fs::rename(replacement, &path).unwrap();
        path
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.directory);
    }
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

#[tokio::test]
async fn device_token_expires_and_stays_bound_to_the_configured_workspace() {
    let fixture = Fixture::new();
    let now = now();
    let path = fixture.registry("project-a", Some((now - 1, now + 90)));
    let access = DeviceAccess::open(path).unwrap();
    assert!(access.authenticate(&fixture.token).await.is_some());
    assert!(
        access
            .authenticate("bapx-device-v1.invalid")
            .await
            .is_none()
    );
    fixture.registry("project-b", Some((now - 1, now + 90)));
    assert!(access.authenticate(&fixture.token).await.is_none());
    fixture.registry("project-a", Some((now - 90, now - 1)));
    assert!(access.authenticate(&fixture.token).await.is_none());
}

#[tokio::test]
async fn removing_the_grant_closes_an_active_event_stream() {
    let fixture = Fixture::new();
    let now = now();
    let access =
        DeviceAccess::open(fixture.registry("project-a", Some((now - 1, now + 90)))).unwrap();
    let lease = access.authenticate(&fixture.token).await.unwrap();
    let (sender, receiver) = tokio::sync::mpsc::channel::<Result<Bytes, io::Error>>(1);
    let mut stream = lease
        .guard_events(Body::from_stream(ReceiverStream::new(receiver)))
        .into_data_stream();
    sender.send(Ok(Bytes::from_static(b"event"))).await.unwrap();
    assert_eq!(
        stream.next().await.unwrap().unwrap(),
        Bytes::from_static(b"event")
    );
    fixture.registry("project-a", None);
    assert!(access.authenticate(&fixture.token).await.is_none());
    assert!(
        tokio::time::timeout(Duration::from_secs(2), stream.next())
            .await
            .unwrap()
            .is_none()
    );
    drop(stream);
    assert!(sender.is_closed());
}

#[test]
fn device_scope_omits_provider_and_operator_routes() {
    assert!(allows(&Method::GET, "/v1/sessions/{id}/stream"));
    assert!(allows(&Method::POST, "/v1/sessions/{id}/prompts"));
    assert!(!allows(&Method::POST, "/v1/sessions/{id}/stream"));
    for route in [
        "/v1/accounts/codex",
        "/v1/secrets",
        "/v1/sync/{id}/file",
        "/v1/terminals",
        "/v1/drain",
    ] {
        assert!(!allows(&Method::GET, route));
        assert!(!allows(&Method::POST, route));
    }
}

#[test]
fn policy_with_public_permissions_or_excessive_lifetime_is_rejected() {
    let fixture = Fixture::new();
    let now = now();
    let path = fixture.registry("project-a", Some((now, now + MAX_LIFETIME_SECONDS + 1)));
    assert!(DeviceAccess::open(path).is_err());
    let path = fixture.registry("project-a", Some((now, now + 90)));
    fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
    assert!(DeviceAccess::open(path).is_err());
}

#[tokio::test]
async fn router_checks_the_device_route_instead_of_inheriting_operator_access() {
    use crate::api::{ApiAuthorization, authenticate};
    use axum::{Router, http::StatusCode, middleware, routing::get};

    let fixture = Fixture::new();
    let now = now();
    let devices =
        DeviceAccess::open(fixture.registry("project-a", Some((now - 1, now + 90)))).unwrap();
    let app = Router::new()
        .route("/v1/sessions", get(|| async { "workspace sessions" }))
        .route("/v1/accounts/codex", get(|| async { "operator settings" }))
        .layer(middleware::from_fn_with_state(
            Arc::new(ApiAuthorization {
                token: "disposable-operator-only".into(),
                devices: Some(devices),
            }),
            authenticate,
        ));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let client = reqwest::Client::new();
    let sessions = format!("http://{address}/v1/sessions");
    let operator_only = format!("http://{address}/v1/accounts/codex");
    let device = client
        .get(sessions)
        .bearer_auth(&fixture.token)
        .send()
        .await
        .unwrap();
    assert_eq!(device.status(), StatusCode::OK);
    let denied = client
        .get(&operator_only)
        .bearer_auth(&fixture.token)
        .send()
        .await
        .unwrap();
    assert_eq!(denied.status(), StatusCode::FORBIDDEN);
    let legacy = client
        .get(operator_only)
        .header("x-cloudroom-token", "disposable-operator-only")
        .send()
        .await
        .unwrap();
    assert_eq!(legacy.status(), StatusCode::OK);
    server.abort();
}
