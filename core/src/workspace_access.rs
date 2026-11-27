//! Resolve operator-approved projects for authenticated bapX members.
//!
//! This module performs no network operations and takes no provider or Core
//! credentials. Callers must authenticate a member before using it.

use reqwest::Url;
use serde::Deserialize;
use std::{
    collections::BTreeSet,
    fs::{self, OpenOptions},
    io::{self, Read},
    os::unix::fs::{MetadataExt, OpenOptionsExt},
    path::{self, Component, Path, PathBuf},
};

const MAX_POLICY_BYTES: usize = 128 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Policy {
    version: u8,
    projects: Vec<ProjectGrant>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProjectGrant {
    business_id: String,
    project_id: String,
    core_id: String,
    core_origin: String,
    workspace_id: String,
    members: Vec<String>,
}

/// A server-side target. Keep the private origin inside the enrollment service.
pub struct PrivateWorkspace {
    pub core_id: String,
    pub core_origin: String,
    pub workspace_id: String,
}

/// Check an operator-provisioned policy without contacting any configured Core.
pub fn check_policy(path: &Path) -> io::Result<()> {
    Policy::read(path).map(drop)
}

/// Resolve one business and project for an already authenticated member UUID.
///
/// Read the current file for every decision. Missing configuration and absent
/// grants return `None`; callers must also deny if the configured policy fails.
pub fn authorize(
    policy_file: Option<&Path>,
    verified_member_id: &str,
    business_id: &str,
    project_id: &str,
) -> io::Result<Option<PrivateWorkspace>> {
    let Some(path) = policy_file else {
        return Ok(None);
    };
    if !member_id(verified_member_id) || !stable_id(business_id) || !stable_id(project_id) {
        return Ok(None);
    }
    let policy = Policy::read(path)?;
    Ok(policy
        .projects
        .into_iter()
        .find(|grant| {
            grant.business_id == business_id
                && grant.project_id == project_id
                && grant
                    .members
                    .iter()
                    .any(|member| member == verified_member_id)
        })
        .map(ProjectGrant::target))
}

/// Resolve the unambiguous workspace of an authenticated member. Multiple
/// grants require a project selection instead of choosing the first row.
pub fn single_workspace_for_member(
    policy_file: Option<&Path>,
    verified_member_id: &str,
) -> io::Result<Option<PrivateWorkspace>> {
    let Some(path) = policy_file else {
        return Ok(None);
    };
    if !member_id(verified_member_id) {
        return Ok(None);
    }
    let policy = Policy::read(path)?;
    let mut grants = policy.projects.into_iter().filter(|grant| {
        grant
            .members
            .iter()
            .any(|member| member == verified_member_id)
    });
    let Some(grant) = grants.next() else {
        return Ok(None);
    };
    if grants.next().is_some() {
        return Ok(None);
    }
    Ok(Some(grant.target()))
}

impl ProjectGrant {
    fn target(self) -> PrivateWorkspace {
        PrivateWorkspace {
            core_id: self.core_id,
            core_origin: self.core_origin,
            workspace_id: self.workspace_id,
        }
    }
}

impl Policy {
    fn read(path: &Path) -> io::Result<Self> {
        // SAFETY: geteuid has no arguments and does not modify process state.
        let euid = unsafe { libc::geteuid() };
        let path = protected_policy_path(path, euid)?;
        let file = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
            .open(path)?;
        let metadata = file.metadata()?;
        if !metadata.is_file() || metadata.uid() != euid || metadata.mode() & 0o077 != 0 {
            return Err(invalid(
                "workspace policy must be a private file owned by the service user",
            ));
        }
        let mut bytes = Vec::new();
        file.take((MAX_POLICY_BYTES + 1) as u64)
            .read_to_end(&mut bytes)?;
        if bytes.len() > MAX_POLICY_BYTES {
            return Err(invalid("workspace policy exceeds the size limit"));
        }
        let policy: Self =
            serde_json::from_slice(&bytes).map_err(|_| invalid("invalid workspace policy JSON"))?;
        policy.validate()?;
        Ok(policy)
    }

    fn validate(&self) -> io::Result<()> {
        if self.version != 1 {
            return Err(invalid("unsupported workspace policy version"));
        }
        let mut projects = BTreeSet::new();
        let mut core_ids = BTreeSet::new();
        let mut origins = BTreeSet::new();
        for grant in &self.projects {
            if !stable_id(&grant.business_id)
                || !stable_id(&grant.project_id)
                || !stable_id(&grant.core_id)
                || grant.core_id.len() > 63
                || crate::workspace::valid_id(&grant.workspace_id).is_err()
                || grant.workspace_id == crate::workspace::ROOT
                || !https_origin(&grant.core_origin)
            {
                return Err(invalid("invalid workspace project or Core target"));
            }
            if !projects.insert((&grant.business_id, &grant.project_id))
                || !core_ids.insert(&grant.core_id)
                || !origins.insert(&grant.core_origin)
            {
                return Err(invalid("repeated workspace project or Core target"));
            }
            if grant.members.len() > 1 {
                return Err(invalid("a dedicated Core can have at most one member"));
            }
            if grant
                .members
                .first()
                .is_some_and(|member| !member_id(member))
            {
                return Err(invalid("invalid workspace member"));
            }
        }
        Ok(())
    }
}

fn protected_policy_path(path: &Path, service_uid: u32) -> io::Result<PathBuf> {
    let path = path::absolute(path)?;
    if path.components().any(|part| part == Component::ParentDir) {
        return Err(invalid(
            "workspace policy path must not contain parent traversal",
        ));
    }
    let parent = path
        .parent()
        .ok_or_else(|| invalid("workspace policy requires a parent directory"))?;
    let directories: Vec<_> = parent.ancestors().collect();
    // Check from the root so each child is reached through a trusted parent.
    for directory in directories.into_iter().rev() {
        let metadata = fs::symlink_metadata(directory)?;
        let owner = metadata.uid();
        let mode = metadata.mode();
        // A trusted sticky ancestor, such as /var/tmp, protects the next
        // component once we verify that its owner is also trusted.
        let protected_sticky_ancestor = directory != parent && mode & libc::S_ISVTX != 0;
        if !metadata.is_dir()
            || (owner != 0 && owner != service_uid)
            || (mode & 0o022 != 0 && !protected_sticky_ancestor)
        {
            return Err(invalid(
                "workspace policy directories must be protected and owned by root or the service user",
            ));
        }
    }
    Ok(path)
}

fn invalid(message: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn stable_id(value: &str) -> bool {
    let alphanumeric = |byte: u8| byte.is_ascii_lowercase() || byte.is_ascii_digit();
    value.len() <= 64
        && value.bytes().next().is_some_and(alphanumeric)
        && value.bytes().all(|byte| alphanumeric(byte) || byte == b'-')
}

fn member_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    value != crate::web::OPERATOR_ID
        && bytes.len() == 36
        && bytes[14] == b'4'
        && matches!(bytes[19], b'8' | b'9' | b'a' | b'b')
        && bytes.iter().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => *byte == b'-',
            _ => byte.is_ascii_digit() || (b'a'..=b'f').contains(byte),
        })
}

fn https_origin(value: &str) -> bool {
    Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https"
            && url.domain().is_some_and(|domain| {
                domain.contains('.') && !domain.ends_with('.') && !domain.ends_with(".localhost")
            })
            && url.origin().ascii_serialization() == value
    })
}

#[cfg(test)]
#[path = "workspace_access_tests.rs"]
mod tests;
