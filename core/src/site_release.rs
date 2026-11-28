//! Linux static publication through an operator-assigned project grant.

use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    os::{
        fd::AsRawFd,
        unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt},
    },
    path::{Path, PathBuf},
};

const SITE_SUFFIX: &str = ".app.bapx.in";
const MAX_FILE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_RELEASE_BYTES: u64 = 128 * 1024 * 1024;
const MAX_ENTRIES: usize = 8192;
const MAX_DEPTH: usize = 12;
const USAGE: &str = "Usage: cloudroom publish-site stage USERS_ROOT SNAPSHOT SLUG ACCOUNT BUSINESS PROJECT\n       cloudroom publish-site release SNAPSHOT RELEASE_ROOT SLUG ACCOUNT BUSINESS PROJECT\n       cloudroom publish-site status RELEASE_ROOT SLUG ACCOUNT BUSINESS PROJECT";

/// Taken from the operator's authorization mapping, never from an HTTP request.
pub struct SiteGrant<'a> {
    pub slug: &'a str,
    pub account: &'a str,
    pub business: &'a str,
    pub project: &'a str,
}

pub struct SiteStore {
    published: PathBuf,
}

pub struct SiteAsset {
    pub file: File,
    pub length: u64,
    pub path: PathBuf,
}

fn invalid(message: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

fn missing() -> io::Error {
    io::Error::from(io::ErrorKind::NotFound)
}

fn slug(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 63
        && value.as_bytes()[0].is_ascii_alphanumeric()
        && value.as_bytes()[value.len() - 1].is_ascii_alphanumeric()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn component(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 255
        && !value.starts_with('.')
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn revision_id(value: &str) -> bool {
    value.len() == 32
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn new_revision() -> io::Result<String> {
    let mut bytes = [0u8; 16];
    File::open("/dev/urandom")?.read_exact(&mut bytes)?;
    Ok(bytes.map(|byte| format!("{byte:02x}")).join(""))
}

fn ref_path(file: &File) -> PathBuf {
    PathBuf::from(format!("/proc/self/fd/{}", file.as_raw_fd()))
}

fn open_reference(path: &Path) -> io::Result<File> {
    OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_PATH | libc::O_NOFOLLOW)
        .open(path)
}

fn child(directory: &File, name: &str) -> io::Result<File> {
    if !component(name) {
        return Err(invalid("Unsupported site path"));
    }
    open_reference(&ref_path(directory).join(name))
}

fn child_directory(directory: &File, name: &str) -> io::Result<File> {
    let entry = child(directory, name)?;
    if !entry.metadata()?.is_dir() {
        return Err(invalid("Site path is not a real directory"));
    }
    Ok(entry)
}

fn file_stamp(metadata: &fs::Metadata) -> (u64, u64, i64, i64, i64, i64, u64) {
    (
        metadata.ino(),
        metadata.dev(),
        metadata.mtime(),
        metadata.mtime_nsec(),
        metadata.ctime(),
        metadata.ctime_nsec(),
        metadata.nlink(),
    )
}

fn create_file(path: &Path, mode: u32) -> io::Result<File> {
    OpenOptions::new()
        .create_new(true)
        .write(true)
        .mode(mode)
        .open(path)
}

fn sync_directory(path: &Path) -> io::Result<()> {
    File::open(path)?.sync_all()
}

struct Temporary(PathBuf);

impl Temporary {
    fn keep(mut self) {
        self.0.clear();
    }
}

impl Drop for Temporary {
    fn drop(&mut self) {
        if self.0.as_os_str().is_empty() {
            return;
        }
        if self.0.is_dir() {
            let _ = fs::remove_dir_all(&self.0);
        } else {
            let _ = fs::remove_file(&self.0);
        }
    }
}

#[derive(Default)]
struct Budget {
    bytes: u64,
    entries: usize,
}

pub fn is_site_host(name: &str) -> bool {
    name.trim_end_matches('.').ends_with(SITE_SUFFIX)
}

pub fn cli(args: &[String]) -> io::Result<()> {
    if matches!(args, [arg] if arg == "--help") {
        println!("{USAGE}");
        return Ok(());
    }
    if let [operation, root, slug, account, business, project] = args
        && operation == "status"
    {
        let grant = SiteGrant {
            slug,
            account,
            business,
            project,
        };
        let store = SiteStore::open(Path::new(root))?;
        match store.active_revision(&grant)? {
            Some(revision) => {
                println!("Published snapshot for https://{slug}{SITE_SUFFIX}/: {revision}");
                println!("Public reachability is not checked.");
            }
            None => println!("No published snapshot for this site."),
        }
        return Ok(());
    }
    let [operation, source, target, slug, account, business, project] = args else {
        return Err(invalid(USAGE));
    };
    let grant = SiteGrant {
        slug,
        account,
        business,
        project,
    };
    match operation.as_str() {
        "stage" => stage(Path::new(source), Path::new(target), &grant)?,
        "release" => {
            let store = SiteStore::open(Path::new(target))?;
            let revision = store.publish(Path::new(source), &grant)?;
            println!("https://{slug}{SITE_SUFFIX}/ {revision}");
        }
        _ => return Err(invalid(USAGE)),
    }
    Ok(())
}

fn validate_grant(grant: &SiteGrant<'_>) -> io::Result<()> {
    if slug(grant.slug)
        && [grant.account, grant.business, grant.project]
            .iter()
            .all(|part| component(part))
    {
        Ok(())
    } else {
        Err(invalid("Invalid website grant"))
    }
}

fn separate(first: &Path, second: &Path) -> io::Result<()> {
    if first.starts_with(second) || second.starts_with(first) {
        return Err(invalid(
            "Website release storage and workspace output must be separate",
        ));
    }
    Ok(())
}

fn new_snapshot(source: &File, destination: &Path) -> io::Result<Temporary> {
    fs::create_dir(destination)?;
    let stage = Temporary(destination.into());
    fs::set_permissions(&stage.0, fs::Permissions::from_mode(0o755))?;
    copy_build(source, &stage.0, 0, &mut Budget::default())?;
    if !stage.0.join("index.html").is_file() {
        return Err(invalid("The built static site must contain an index.html"));
    }
    Ok(stage)
}

/// Copy the grant's build output into a protected, operator-created directory
/// before the Docker daemon resolves its bind-mount source.
pub fn stage(users_root: &Path, destination: &Path, grant: &SiteGrant<'_>) -> io::Result<()> {
    validate_grant(grant)?;
    let users = open_reference(users_root)?;
    if !users.metadata()?.is_dir() {
        return Err(invalid("Workspace source root must be a real directory"));
    }
    let parent = destination
        .parent()
        .ok_or_else(|| invalid("Snapshot destination must have an operator-owned parent"))?;
    let parent = parent.canonicalize()?;
    if parent.metadata()?.mode() & 0o077 != 0 {
        return Err(invalid("Snapshot parent must be private (0700)"));
    }
    let name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| component(name))
        .ok_or_else(|| invalid("Invalid snapshot name"))?;
    let destination = parent.join(name);
    separate(&ref_path(&users).canonicalize()?, &destination)?;
    let account = child_directory(&users, grant.account)?;
    let business = child_directory(&account, grant.business)?;
    let projects = child_directory(&business, "projects")?;
    let project = child_directory(&projects, grant.project)?;
    let output = child_directory(&project, "dist")?;
    let snapshot = new_snapshot(&output, &destination)?;
    sync_directory(&parent)?;
    // The operator retains the completed snapshot until Docker exits.
    snapshot.keep();
    Ok(())
}

fn copy_build(source: &File, target: &Path, depth: usize, budget: &mut Budget) -> io::Result<()> {
    if depth > MAX_DEPTH {
        return Err(invalid("Site exceeds maximum directory depth"));
    }
    let metadata = source.metadata()?;
    let directory = ref_path(source);
    for entry in fs::read_dir(directory)? {
        budget.entries += 1;
        if budget.entries > MAX_ENTRIES {
            return Err(invalid("Site exceeds maximum entry count"));
        }
        let entry = entry?;
        let name = entry.file_name();
        let name = name
            .to_str()
            .ok_or_else(|| invalid("Site path must be UTF-8"))?;
        let input = child(source, name)?;
        let before = input.metadata()?;
        if before.dev() != metadata.dev() {
            return Err(invalid("Site cannot contain mounted content"));
        }
        let output = target.join(name);
        if before.is_dir() {
            fs::create_dir(&output)?;
            fs::set_permissions(&output, fs::Permissions::from_mode(0o755))?;
            copy_build(&input, &output, depth + 1, budget)?;
            continue;
        }
        if !before.is_file() || before.nlink() != 1 {
            return Err(invalid("Site can contain only regular, unlinked files"));
        }
        let remaining = MAX_RELEASE_BYTES - budget.bytes;
        let limit = remaining.min(MAX_FILE_BYTES);
        if before.len() > limit {
            return Err(invalid("Site exceeds maximum file or release size"));
        }
        // Open only the checked inode. A rename to a symlink cannot redirect this read.
        let reader = File::open(ref_path(&input))?;
        let mut file = create_file(&output, 0o644)?;
        file.set_permissions(fs::Permissions::from_mode(0o644))?;
        let size = io::copy(&mut (&reader).take(limit + 1), &mut file)?;
        let after = reader.metadata()?;
        if size > limit || size != before.len() || file_stamp(&before) != file_stamp(&after) {
            return Err(invalid("Build output changed during publication"));
        }
        file.sync_all()?;
        budget.bytes += size;
    }
    if file_stamp(&metadata) != file_stamp(&source.metadata()?) {
        return Err(invalid("Build directory changed during publication"));
    }
    sync_directory(target)
}

fn selected_revision(site: &File) -> io::Result<(String, File)> {
    let pointer = child(site, "current").map_err(|_| missing())?;
    let metadata = pointer.metadata()?;
    if !metadata.is_file() || metadata.nlink() != 1 || metadata.len() != 33 {
        return Err(missing());
    }
    let mut current = String::new();
    File::open(ref_path(&pointer))?
        .take(33)
        .read_to_string(&mut current)?;
    let revision = current
        .strip_suffix('\n')
        .filter(|id| revision_id(id))
        .ok_or_else(missing)?;
    let revisions = child_directory(site, "revisions").map_err(|_| missing())?;
    let entry = child_directory(&revisions, revision).map_err(|_| missing())?;
    Ok((revision.to_owned(), entry))
}

impl SiteStore {
    /// The public reader receives only this separate publication store.
    pub fn open(published_root: &Path) -> io::Result<Self> {
        let published = open_reference(published_root)?;
        let metadata = published.metadata()?;
        if !metadata.is_dir() || metadata.mode() & 0o022 != 0 {
            return Err(invalid(
                "Website publication storage must be a real directory owned by the operator",
            ));
        }
        Ok(Self {
            published: published_root.canonicalize()?,
        })
    }

    /// Promote a validated build from the operator's protected staging area.
    pub fn publish(&self, snapshot: &Path, grant: &SiteGrant<'_>) -> io::Result<String> {
        validate_grant(grant)?;
        let site = self.published.join(grant.slug);
        let identity = format!("{}/{}/{}\n", grant.account, grant.business, grant.project);
        let owner = site.join("owner");
        match fs::read_to_string(&owner) {
            Ok(prior) if prior != identity => {
                return Err(io::Error::from(io::ErrorKind::PermissionDenied));
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        let source = open_reference(snapshot)?;
        if !source.metadata()?.is_dir() {
            return Err(invalid("Website snapshot must be a real directory"));
        }
        separate(&ref_path(&source).canonicalize()?, &self.published)?;

        let revisions = site.join("revisions");
        fs::create_dir_all(&revisions)?;
        let revision = new_revision()?;
        let staged = new_snapshot(&source, &revisions.join(format!(".build-{revision}")))?;

        let claim = Temporary(site.join(format!(".owner-{revision}")));
        let mut claim_file = create_file(&claim.0, 0o600)?;
        claim_file.write_all(identity.as_bytes())?;
        claim_file.sync_all()?;
        match fs::hard_link(&claim.0, &owner) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                if fs::read_to_string(&owner)? != identity {
                    return Err(io::Error::from(io::ErrorKind::PermissionDenied));
                }
            }
            Err(error) => return Err(error),
        }
        fs::rename(&staged.0, revisions.join(&revision))?;
        sync_directory(&revisions)?;

        let pointer = Temporary(site.join(format!(".current-{revision}")));
        let mut pointer_file = create_file(&pointer.0, 0o644)?;
        writeln!(pointer_file, "{revision}")?;
        pointer_file.sync_all()?;
        fs::rename(&pointer.0, site.join("current"))?;
        sync_directory(&site)?;
        sync_directory(&self.published)?;
        Ok(revision)
    }

    /// Inspect the local release store for an operator-approved binding.
    /// This neither checks public routing nor contacts the site's HTTPS origin.
    pub fn active_revision(&self, grant: &SiteGrant<'_>) -> io::Result<Option<String>> {
        validate_grant(grant)?;
        let directory = open_reference(&self.published)?;
        let site = match child_directory(&directory, grant.slug) {
            Ok(site) => site,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
        };

        let expected = format!("{}/{}/{}\n", grant.account, grant.business, grant.project);
        let owner = child(&site, "owner")?;
        let metadata = owner.metadata()?;
        if !metadata.is_file() || metadata.nlink() != 1 || metadata.len() != expected.len() as u64 {
            return Err(io::Error::from(io::ErrorKind::PermissionDenied));
        }
        let mut identity = Vec::new();
        File::open(ref_path(&owner))?
            .take(expected.len() as u64 + 1)
            .read_to_end(&mut identity)?;
        if identity.as_slice() != expected.as_bytes() {
            return Err(io::Error::from(io::ErrorKind::PermissionDenied));
        }

        let (revision, entry) = selected_revision(&site)?;
        let index = child(&entry, "index.html")?;
        let metadata = index.metadata()?;
        if !metadata.is_file() || metadata.nlink() != 1 || metadata.len() > MAX_FILE_BYTES {
            return Err(missing());
        }
        Ok(Some(revision))
    }

    /// Resolve only an exact hostname and the immutable published revision.
    /// The HTTP router owns GET/HEAD enforcement, MIME selection and response headers.
    pub fn resolve(&self, hostname: &str, request_path: &str) -> io::Result<SiteAsset> {
        if hostname.len() > 63 + SITE_SUFFIX.len() || request_path.len() > (MAX_DEPTH + 1) * 256 {
            return Err(missing());
        }
        let name = hostname.to_ascii_lowercase();
        let host_slug = name
            .strip_suffix(SITE_SUFFIX)
            .filter(|name| slug(name))
            .ok_or_else(missing)?;
        let path = request_path.strip_prefix('/').ok_or_else(missing)?;
        let mut path = path.to_owned();
        if path.is_empty() || path.ends_with('/') {
            path.push_str("index.html");
        }
        let segments: Vec<_> = path.split('/').collect();
        if segments.len() > MAX_DEPTH + 1 || !segments.iter().all(|part| component(part)) {
            return Err(missing());
        }

        let directory = open_reference(&self.published)?;
        let site = child_directory(&directory, host_slug).map_err(|_| missing())?;
        let (_, mut entry) = selected_revision(&site)?;
        for (index, segment) in segments.iter().enumerate() {
            if index + 1 == segments.len() {
                let asset = child(&entry, segment).map_err(|_| missing())?;
                let metadata = asset.metadata()?;
                if !metadata.is_file() || metadata.nlink() != 1 || metadata.len() > MAX_FILE_BYTES {
                    return Err(missing());
                }
                return Ok(SiteAsset {
                    file: File::open(ref_path(&asset))?,
                    length: metadata.len(),
                    path: path.into(),
                });
            }
            entry = child_directory(&entry, segment).map_err(|_| missing())?;
        }
        Err(missing())
    }
}

#[cfg(test)]
#[path = "site_release_tests.rs"]
mod tests;
