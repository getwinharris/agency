use super::*;

struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        Self(std::env::temp_dir().join(format!(
            "bapx-accounts-test-{}",
            hex(&random_bytes::<16>().unwrap())
        )))
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn invitation_survives_restart_and_creates_one_durable_member() {
    let fixture = Fixture::new();
    let accounts = Accounts::open(&fixture.0).unwrap();
    let email = normalize_email("  Member@Example.Test ").unwrap();
    let replaced = accounts.invite(email.clone()).unwrap();
    let invite = accounts.invite(email.clone()).unwrap();
    let key = token_digest(&invite);
    let on_disk = fs::read_to_string(&accounts.file).unwrap();
    assert!(!on_disk.contains(&replaced));
    assert!(!on_disk.contains(&invite));
    assert!(on_disk.contains(&key));
    assert_eq!(
        accounts.file.metadata().unwrap().permissions().mode() & 0o777,
        0o600
    );
    drop(accounts);

    let accounts = Accounts::open(&fixture.0).unwrap();
    let password = "disposable member password";
    let member = accounts
        .accept_invite(
            &key,
            PasswordHash::derive(password).unwrap(),
            Some("operator"),
        )
        .unwrap();
    assert_eq!(member.identifier, "member@example.test");
    assert_eq!(member.role, Role::Member);
    assert_ne!(member.id, OPERATOR_ID);
    for used in [key, token_digest(&replaced)] {
        let replay = accounts.accept_invite(
            &used,
            PasswordHash {
                salt: [0; 16],
                value: [0; 32],
            },
            None,
        );
        assert_eq!(replay.err().unwrap().0, INVITE_INVALID.0);
    }
    let persisted = Accounts::open(&fixture.0).unwrap().read().unwrap();
    assert!(persisted.invites.is_empty());
    let recorded = &persisted.members[&email];
    assert_eq!(recorded.id, member.id);
    assert!(PasswordHash::verify(password, Some(&recorded.password)));
    assert!(!PasswordHash::verify("incorrect", Some(&recorded.password)));
    assert!(!PasswordHash::verify(password, None));
}

#[test]
fn expired_or_reserved_invites_do_not_grant_accounts() {
    let fixture = Fixture::new();
    let accounts = Accounts::open(&fixture.0).unwrap();
    let expired = token_digest(&accounts.invite("expired@example.test".into()).unwrap());
    let reserved = token_digest(&accounts.invite("admin@example.test".into()).unwrap());
    accounts
        .update(|records| {
            records.invites.get_mut(&expired).unwrap().expires = 0;
            Ok(())
        })
        .unwrap();
    for key in [expired, reserved] {
        let result = accounts.accept_invite(
            &key,
            PasswordHash {
                salt: [0; 16],
                value: [0; 32],
            },
            Some("Admin@example.test"),
        );
        assert_eq!(result.err().unwrap().0, INVITE_INVALID.0);
    }
    assert!(accounts.read().unwrap().members.is_empty());
}

#[test]
fn session_uses_one_host_cookie_and_expires_server_side() {
    let fixture = Fixture::new();
    let accounts = Accounts::open(&fixture.0).unwrap();
    let response = accounts
        .issue(Principal {
            id: OPERATOR_ID.to_owned(),
            identifier: "operator".to_owned(),
            role: Role::Operator,
        })
        .unwrap();
    let cookie = response.headers()[header::SET_COOKIE].to_str().unwrap();
    assert!(cookie.starts_with("__Host-bapx-session="));
    assert!(cookie.contains("Secure; HttpOnly; SameSite=Strict"));
    assert!(!cookie.contains("Domain="));
    let pair = cookie.split(';').next().unwrap();
    let mut headers = HeaderMap::new();
    headers.insert(header::COOKIE, pair.parse().unwrap());
    assert_eq!(accounts.principal(&headers).unwrap().role, Role::Operator);
    assert!(
        Accounts::open(&fixture.0)
            .unwrap()
            .principal(&headers)
            .is_none()
    );
    {
        let key = session_key(&headers).unwrap();
        let mut sessions = accounts.sessions.lock().unwrap();
        assert!(!sessions.contains_key(pair.split_once('=').unwrap().1));
        sessions.get_mut(&key).unwrap().expires = Instant::now();
    }
    assert!(accounts.principal(&headers).is_none());
    headers.append(header::COOKIE, pair.parse().unwrap());
    assert!(session_key(&headers).is_none());
}
