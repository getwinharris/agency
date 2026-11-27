use super::*;
use ring::rand::{SecureRandom, SystemRandom};
use serde_json::{Value, json};
use std::{fs, io::Write, os::unix::fs::PermissionsExt, path::PathBuf};

const MEMBER: &str = "65c18bec-bbc3-40c3-9712-8bb080e56e54";
const OUTSIDER: &str = "b0b269b8-fd77-4a82-9236-9f3400899941";

struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        let mut entropy = [0u8; 16];
        SystemRandom::new().fill(&mut entropy).unwrap();
        let id = entropy
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let directory = std::env::temp_dir().join(format!("bapx-workspace-policy-{id}"));
        fs::create_dir(&directory).unwrap();
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).unwrap();
        Self(directory)
    }

    fn policy(&self, projects: Vec<Value>) -> PathBuf {
        let path = self.0.join("policy.json");
        let replacement = self.0.join("next.json");
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&replacement)
            .unwrap()
            .write_all(&serde_json::to_vec(&json!({"version": 1, "projects": projects})).unwrap())
            .unwrap();
        fs::rename(replacement, &path).unwrap();
        path
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn project(suffix: &str, member: &str) -> Value {
    json!({
        "business_id": "business-a",
        "project_id": format!("project-{suffix}"),
        "core_id": format!("core-{suffix}"),
        "core_origin": format!("https://core-{suffix}.example.test"),
        "workspace_id": format!("ws_{suffix}"),
        "members": [member],
    })
}

#[test]
fn resolves_only_the_signed_in_members_project_and_observes_revocation() {
    let fixture = Fixture::new();
    let path = fixture.policy(vec![project("a", MEMBER)]);
    check_policy(&path).unwrap();
    assert!(
        authorize(None, MEMBER, "business-a", "project-a")
            .unwrap()
            .is_none()
    );
    assert!(
        authorize(Some(&path), OUTSIDER, "business-a", "project-a")
            .unwrap()
            .is_none()
    );
    assert!(
        authorize(Some(&path), MEMBER, "business-b", "project-a")
            .unwrap()
            .is_none()
    );
    let target = authorize(Some(&path), MEMBER, "business-a", "project-a")
        .unwrap()
        .unwrap();
    assert_eq!(target.core_id, "core-a");
    assert_eq!(target.core_origin, "https://core-a.example.test");
    assert_eq!(
        single_workspace_for_member(Some(&path), MEMBER)
            .unwrap()
            .unwrap()
            .workspace_id,
        "ws_a"
    );
    fixture.policy(vec![project("a", OUTSIDER)]);
    assert!(
        authorize(Some(&path), MEMBER, "business-a", "project-a")
            .unwrap()
            .is_none()
    );
}

#[test]
fn requires_project_selection_with_more_than_one_matching_grant() {
    let fixture = Fixture::new();
    let path = fixture.policy(vec![project("a", MEMBER), project("b", MEMBER)]);
    assert!(
        single_workspace_for_member(Some(&path), MEMBER)
            .unwrap()
            .is_none()
    );
    assert!(
        authorize(Some(&path), MEMBER, "business-a", "project-b")
            .unwrap()
            .is_some()
    );
}

#[test]
fn rejects_unsafe_policy_permissions_targets_and_bindings() {
    let fixture = Fixture::new();
    let mut unsafe_target = project("a", MEMBER);
    unsafe_target["core_origin"] = json!("https://core.example.test/private");
    assert!(check_policy(&fixture.policy(vec![unsafe_target])).is_err());

    let path = fixture.policy(vec![project("a", MEMBER), project("a", OUTSIDER)]);
    assert!(check_policy(&path).is_err());
    let path = fixture.policy(vec![project("a", MEMBER)]);
    fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
    assert!(check_policy(&path).is_err());
}
