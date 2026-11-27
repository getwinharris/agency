use super::*;
use crate::{
    config::Config,
    runtime,
    session::{Journal, Manager, Record},
};
use ring::rand::{SecureRandom, SystemRandom};
use serde_json::{Value, json};
use std::{
    io::Write,
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
};

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
        let directory = PathBuf::from(env::var_os("HOME").unwrap())
            .join(format!("bapx-device-test-{}", &suffix[..16]));
        fs::create_dir(&directory).unwrap();
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).unwrap();
        Self {
            directory: directory.canonicalize().unwrap(),
            token: format!("{TOKEN_PREFIX}{suffix}"),
        }
    }

    fn trust(&self) -> FileTrust {
        let service_uid = fs::metadata(&self.directory).unwrap().uid();
        FileTrust {
            service_uid,
            agent_uid: if service_uid == 1000 { 1001 } else { 1000 },
        }
    }

    fn open(&self, path: PathBuf) -> io::Result<Arc<DeviceAccess>> {
        DeviceAccess::open(path, self.trust())
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
    let access = fixture.open(path).unwrap();
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
    assert!(fixture.open(path).is_err());
    let path = fixture.registry("project-a", Some((now, now + 90)));
    fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
    assert!(fixture.open(path).is_err());
}

#[test]
fn managed_policy_rejects_replaceable_ancestors_and_workload_owned_files() {
    let fixture = Fixture::new();
    let path = fixture.registry("project-a", None);
    let nested = fixture.directory.join("subdir");
    fs::create_dir(&nested).unwrap();
    let child = nested.join("devices.json");
    fs::rename(path, &child).unwrap();

    fs::set_permissions(&fixture.directory, fs::Permissions::from_mode(0o722)).unwrap();
    let error = fixture.open(child.clone()).err().unwrap();
    assert!(error.to_string().contains("protected ancestor"));
    fs::set_permissions(&fixture.directory, fs::Permissions::from_mode(0o700)).unwrap();

    // Access checks the final inode's owner even when all parent directories are trusted.
    let owner = fs::metadata(&child).unwrap().uid();
    let trust = FileTrust {
        service_uid: owner,
        agent_uid: owner,
    };
    assert!(!trust.trusted_owner(owner));
    assert!(DeviceAccess::open(child, trust).is_err());
}

#[test]
fn a_new_core_start_cannot_rebind_an_existing_state_owner() {
    let fixture = Fixture::new();
    let original = fixture.registry("project-a", None);
    let marker = fixture.directory.join(STATE_BINDING_FILE);
    let binding: Value = serde_json::from_slice(&fs::read(&original).unwrap()).unwrap();
    OpenOptions::new()
        .create_new(true)
        .write(true)
        .mode(0o600)
        .open(marker)
        .unwrap()
        .write_all(&serde_json::to_vec(&binding["binding"]).unwrap())
        .unwrap();
    fixture
        .open(original)
        .unwrap()
        .verify_state_binding(&fixture.directory, Some("core-test"))
        .unwrap();

    let changed = fixture.registry("project-b", None);
    assert!(
        fixture
            .open(changed)
            .unwrap()
            .verify_state_binding(&fixture.directory, Some("core-test"))
            .is_err()
    );
}

#[tokio::test]
async fn running_core_routes_scope_sessions_and_close_revoked_event_streams() {
    use crate::api::router_with_devices;
    use axum::http::StatusCode;

    let fixture = Fixture::new();
    let now = now();
    let devices = fixture
        .open(fixture.registry("project-a", Some((now - 1, now + 90))))
        .unwrap();
    let state_dir = fixture.directory.join("state");
    let mut journal = Journal::open(&state_dir).unwrap();
    for (sequence, id, workspace) in [
        (1, "cr_allowed", "project-a"),
        (2, "cr_foreign", "project-b"),
    ] {
        journal
            .append(
                &serde_json::to_vec(&Record {
                    sequence,
                    session_id: id.to_owned(),
                    kind: "workspace".into(),
                    timestamp_ms: None,
                    data: json!({"id":workspace,"path":fixture.directory.join(workspace)}),
                    native: None,
                })
                .unwrap(),
            )
            .unwrap();
    }
    drop(journal);
    let manager = Manager::open(Config {
        listen: "127.0.0.1:0".parse().unwrap(),
        token: "disposable-operator-only".into(),
        state_dir,
        repository: fixture.directory.clone(),
        api_url: None,
        store: "fixture".into(),
        instance: None,
        account_home: fixture.directory.clone(),
        default_harness: runtime::Kind::Codex,
        harnesses: Default::default(),
        storage: None,
        rpc_timeout: Duration::from_secs(30),
        diagnostic_upload: Duration::from_secs(1),
        previous_exit_wait: Duration::ZERO,
    })
    .unwrap();
    manager.workspaces.resolve("project-a", None).unwrap();
    let app = router_with_devices(manager, "disposable-operator-only".into(), Some(devices));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let client = reqwest::Client::new();
    let endpoint = |path: &str| format!("http://{address}/v1/{path}");
    let grant = |path| client.get(endpoint(path)).bearer_auth(&fixture.token);

    let sessions: Value = grant("sessions")
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(sessions["total"], 1);
    assert_eq!(sessions["sessions"][0]["session_id"], "cr_allowed");
    for route in [
        "sessions/cr_foreign",
        "sessions/cr_foreign/events",
        "sessions/missing",
        "accounts/codex",
        "dashboard",
    ] {
        assert_eq!(
            grant(route).send().await.unwrap().status(),
            StatusCode::FORBIDDEN
        );
    }
    let operator: Value = client
        .get(endpoint("sessions"))
        .header("x-cloudroom-token", "disposable-operator-only")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(operator["total"], 2);

    for forbidden in [
        json!({"request_id":"different", "workspace":"root"}),
        json!({"request_id":"different", "continue_from":"cr_foreign"}),
        json!({"request_id":"foreign"}),
    ] {
        let denied = client
            .post(endpoint("sessions"))
            .bearer_auth(&fixture.token)
            .json(&forbidden)
            .send()
            .await
            .unwrap();
        assert_eq!(denied.status(), StatusCode::CONFLICT);
        let answer: Value = denied.json().await.unwrap();
        assert!(answer["error"].as_str().unwrap().contains("workspace"));
    }

    let mut events = grant("sessions/cr_allowed/stream")
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    let first = tokio::time::timeout(Duration::from_secs(3), events.chunk())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(String::from_utf8_lossy(&first).contains("cr_allowed"));
    fixture.registry("project-a", None);
    let end = tokio::time::timeout(Duration::from_secs(3), events.chunk())
        .await
        .unwrap()
        .unwrap();
    assert!(end.is_none());
    assert_eq!(
        grant("sessions").send().await.unwrap().status(),
        StatusCode::UNAUTHORIZED
    );
    server.abort();
}
