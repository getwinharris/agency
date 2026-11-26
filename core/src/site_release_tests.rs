use super::*;
use std::{os::unix::fs::symlink, process::Command};

const GRANT: SiteGrant<'_> = SiteGrant {
    slug: "pilot",
    account: "qa-user",
    business: "qa-business",
    project: "qa-project",
};

struct Fixture {
    _root: Temporary,
    users: PathBuf,
    store: SiteStore,
    source: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let root = Temporary(
            std::env::temp_dir().join(format!("bapx-site-test-{}", new_revision().unwrap())),
        );
        fs::create_dir(&root.0).unwrap();
        fs::set_permissions(&root.0, fs::Permissions::from_mode(0o700)).unwrap();
        let users = root.0.join("users");
        let source = users.join("qa-user/qa-business/projects/qa-project/dist");
        fs::create_dir_all(source.join("assets")).unwrap();
        fs::write(source.join("index.html"), "first revision").unwrap();
        fs::write(source.join("assets/index.html"), "nested index").unwrap();
        fs::write(source.join("assets/app.js"), "console.log('published');").unwrap();
        let published = root.0.join("published");
        fs::create_dir(&published).unwrap();
        let store = SiteStore::open(&published).unwrap();
        Self {
            _root: root,
            users,
            store,
            source,
        }
    }

    fn publish(&self) -> io::Result<String> {
        self.publish_grant(&GRANT)
    }

    fn publish_grant(&self, grant: &SiteGrant<'_>) -> io::Result<String> {
        let staged = Temporary(self._root.0.join("staged"));
        stage(&self.users, &staged.0, grant)?;
        self.store.publish(&staged.0, grant)
    }

    fn text(&self, path: &str) -> io::Result<String> {
        let mut asset = self.store.resolve("pilot.app.bapx.in", path)?;
        let mut body = String::new();
        asset.file.read_to_string(&mut body)?;
        assert_eq!(asset.length, body.len() as u64);
        assert!(!asset.path.is_absolute());
        Ok(body)
    }
}

#[test]
fn publishes_complete_revisions_and_reads_only_the_bound_host() {
    let fixture = Fixture::new();
    assert!(fixture.text("/").is_err());
    let first = fixture.publish().unwrap();
    assert!(revision_id(&first));
    assert_eq!(fixture.text("/").unwrap(), "first revision");
    assert_eq!(fixture.text("/assets/").unwrap(), "nested index");
    assert_eq!(
        fixture.text("/assets/app.js").unwrap(),
        "console.log('published');"
    );

    let mut old_asset = fixture.store.resolve("PILOT.app.bapx.in", "/").unwrap();
    fs::write(fixture.source.join("index.html"), "second revision").unwrap();
    assert_eq!(fixture.text("/").unwrap(), "first revision");
    let second = fixture.publish().unwrap();
    assert_ne!(first, second);
    assert_eq!(fixture.text("/").unwrap(), "second revision");
    let mut old_body = String::new();
    old_asset.file.read_to_string(&mut old_body).unwrap();
    assert_eq!(old_body, "first revision");

    for host in [
        "app.bapx.in",
        "pilot.evil.app.bapx.in",
        "pilot.app.bapx.in.example.test",
        "different.app.bapx.in",
        "pilot.app.bapx.in:443",
    ] {
        assert!(fixture.store.resolve(host, "/").is_err(), "{host}");
    }
    for path in [
        "/../index.html",
        "/%2e%2e/index.html",
        "/assets//",
        "/.git/config",
        "/owner",
        "/current",
    ] {
        assert!(fixture.text(path).is_err(), "{path}");
    }
}

#[test]
fn assigned_slug_cannot_be_taken_by_another_project() {
    let fixture = Fixture::new();
    fixture.publish().unwrap();
    let other = fixture
        .users
        .join("another/qa-business/projects/qa-project/dist");
    fs::create_dir_all(&other).unwrap();
    fs::write(other.join("index.html"), "other").unwrap();
    assert_eq!(
        fixture
            .publish_grant(&SiteGrant {
                account: "another",
                ..GRANT
            })
            .unwrap_err()
            .kind(),
        io::ErrorKind::PermissionDenied
    );
    assert!(
        fixture
            .publish_grant(&SiteGrant {
                project: "..",
                ..GRANT
            })
            .is_err()
    );
    assert_eq!(fixture.text("/").unwrap(), "first revision");
}

#[test]
fn rejects_symlinks_hardlinks_and_special_files_without_advancing_current() {
    let fixture = Fixture::new();
    fixture.publish().unwrap();
    let private = fixture._root.0.join("private");
    fs::write(&private, "unpublished content").unwrap();
    let entry = fixture.source.join("bad.txt");

    symlink(&private, &entry).unwrap();
    assert!(fixture.publish().is_err());
    fs::remove_file(&entry).unwrap();
    fs::hard_link(&private, &entry).unwrap();
    assert!(fixture.publish().is_err());
    fs::remove_file(&entry).unwrap();
    assert!(
        Command::new("mkfifo")
            .arg(&entry)
            .status()
            .unwrap()
            .success()
    );
    assert!(fixture.publish().is_err());
    fs::remove_file(&entry).unwrap();

    fs::rename(&fixture.source, fixture.source.with_extension("moved")).unwrap();
    symlink(fixture.source.with_extension("moved"), &fixture.source).unwrap();
    assert!(fixture.publish().is_err());
    assert_eq!(fixture.text("/").unwrap(), "first revision");
}

#[test]
fn replacing_a_checked_input_after_open_never_redirects_the_copy() {
    let fixture = Fixture::new();
    let output = open_reference(&fixture.source).unwrap();
    let anchored = child(&output, "index.html").unwrap();
    let private = fixture._root.0.join("private");
    fs::write(&private, "unpublished content").unwrap();

    fs::rename(
        fixture.source.join("index.html"),
        fixture.source.join("old.html"),
    )
    .unwrap();
    symlink(private, fixture.source.join("index.html")).unwrap();
    let mut body = String::new();
    File::open(ref_path(&anchored))
        .unwrap()
        .read_to_string(&mut body)
        .unwrap();
    assert_eq!(body, "first revision");
    assert!(fixture.publish().is_err());
    assert!(fixture.text("/").is_err());
}

#[test]
fn rejects_parent_directory_symlinks_and_unpublished_output() {
    let fixture = Fixture::new();
    let nested = fixture.users.join("qa-user/qa-business/projects");
    let moved = nested.with_extension("hidden");
    fs::rename(&nested, &moved).unwrap();
    symlink(&moved, &nested).unwrap();
    assert!(fixture.publish().is_err());
    fs::remove_file(&nested).unwrap();
    fs::rename(moved, nested).unwrap();

    fs::remove_file(fixture.source.join("index.html")).unwrap();
    assert!(fixture.publish().is_err());
    assert!(fixture.text("/").is_err());
}

#[test]
fn stale_or_tampered_public_pointer_and_assets_fail_closed() {
    let fixture = Fixture::new();
    let revision = fixture.publish().unwrap();
    let site = fixture.store.published.join("pilot");
    fs::write(site.join("current"), "../../owner").unwrap();
    assert!(fixture.text("/").is_err());
    fs::write(site.join("current"), format!("{revision}\n")).unwrap();
    let snapshot = site.join("revisions").join(revision);
    let private = fixture._root.0.join("private");
    fs::write(&private, "unpublished content").unwrap();
    fs::remove_file(snapshot.join("index.html")).unwrap();
    symlink(private, snapshot.join("index.html")).unwrap();
    assert!(fixture.text("/").is_err());
}

#[test]
fn oversized_release_fails_while_the_prior_revision_stays_readable() {
    let fixture = Fixture::new();
    fixture.publish().unwrap();
    let too_big = File::create(fixture.source.join("too-large.bin")).unwrap();
    too_big.set_len(MAX_FILE_BYTES + 1).unwrap();
    assert_eq!(
        fixture.publish().unwrap_err().kind(),
        io::ErrorKind::InvalidInput
    );
    assert_eq!(fixture.text("/").unwrap(), "first revision");
}
