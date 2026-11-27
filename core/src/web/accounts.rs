use super::{APEX, APEX_ORIGIN, OPERATOR_ID, Site, admin_store, host};
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State, rejection::JsonRejection},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use ring::{
    digest, pbkdf2,
    rand::{SecureRandom, SystemRandom},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    collections::BTreeMap,
    fs::{DirBuilder, File},
    io::{self, Read},
    num::NonZeroU32,
    os::unix::fs::{DirBuilderExt, PermissionsExt},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Semaphore;

const COOKIE: &str = "__Host-bapx-session";
const COOKIE_ATTRIBUTES: &str = "Path=/; Secure; HttpOnly; SameSite=Strict";
const SESSION_TTL: Duration = Duration::from_secs(8 * 60 * 60);
const INVITE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const ATTEMPT_WINDOW: Duration = Duration::from_secs(60);
const MAX_ATTEMPTS: usize = 60;
const MAX_ATTEMPTS_PER_IDENTIFIER: usize = 8;
const MAX_SESSIONS: usize = 1024;
const MAX_SESSIONS_PER_ACCOUNT: usize = 8;
const MAX_MEMBERS: usize = 4096;
const MAX_INVITES: usize = 128;
const MAX_STORE_BYTES: u64 = 4 * 1024 * 1024;
const MAX_BODY_BYTES: usize = 2048;
const MAX_PASSWORD_BYTES: usize = 512;
const PASSWORD_ITERATIONS: NonZeroU32 = NonZeroU32::new(600_000).unwrap();

pub(super) struct Accounts {
    file: PathBuf,
    writer: Mutex<()>,
    sessions: Mutex<BTreeMap<String, Session>>,
    attempts: Mutex<Attempts>,
    workers: Arc<Semaphore>,
}

struct Attempts {
    start: Instant,
    total: usize,
    by_identifier: BTreeMap<String, usize>,
}

impl Attempts {
    fn new(now: Instant) -> Self {
        Self {
            start: now,
            total: 0,
            by_identifier: BTreeMap::new(),
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Records {
    version: u8,
    members: BTreeMap<String, Member>,
    invites: BTreeMap<String, Invitation>,
}

impl Default for Records {
    fn default() -> Self {
        Self {
            version: 1,
            members: BTreeMap::new(),
            invites: BTreeMap::new(),
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Member {
    id: String,
    password: PasswordHash,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct PasswordHash {
    salt: [u8; 16],
    value: [u8; 32],
}

impl PasswordHash {
    fn derive(password: &str) -> Result<Self, Failure> {
        let salt = random_bytes()?;
        let mut value = [0; 32];
        pbkdf2::derive(
            pbkdf2::PBKDF2_HMAC_SHA256,
            PASSWORD_ITERATIONS,
            &salt,
            password.as_bytes(),
            &mut value,
        );
        Ok(Self { salt, value })
    }

    fn verify(password: &str, stored: Option<&Self>) -> bool {
        let dummy = Self {
            salt: [0; 16],
            value: [0; 32],
        };
        let selected = stored.unwrap_or(&dummy);
        pbkdf2::verify(
            pbkdf2::PBKDF2_HMAC_SHA256,
            PASSWORD_ITERATIONS,
            &selected.salt,
            password.as_bytes(),
            &selected.value,
        )
        .is_ok()
            && stored.is_some()
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Invitation {
    email: String,
    expires: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Role {
    Member,
    Operator,
}

#[derive(Clone, Serialize)]
struct Principal {
    id: String,
    identifier: String,
    role: Role,
}

struct Session {
    principal: Principal,
    expires: Instant,
}

#[derive(Clone, Copy, Debug)]
struct Failure(StatusCode, &'static str);

const MISSING: Failure = Failure(StatusCode::NOT_FOUND, "Not found.");
const INVALID: Failure = Failure(StatusCode::BAD_REQUEST, "Check the submitted values.");
const INVALID_LOGIN: Failure = Failure(
    StatusCode::UNAUTHORIZED,
    "The account or password is incorrect.",
);
const INVITE_INVALID: Failure = Failure(
    StatusCode::BAD_REQUEST,
    "This invitation is invalid or expired.",
);
const SIGN_IN: Failure = Failure(StatusCode::UNAUTHORIZED, "Sign in to continue.");
const FORBIDDEN: Failure = Failure(StatusCode::FORBIDDEN, "Access denied.");
const CONFLICT: Failure = Failure(StatusCode::CONFLICT, "This account cannot be invited.");
const LIMITED: Failure = Failure(
    StatusCode::TOO_MANY_REQUESTS,
    "Too many requests. Try again shortly.",
);
const UNAVAILABLE: Failure = Failure(
    StatusCode::SERVICE_UNAVAILABLE,
    "Account access is temporarily unavailable.",
);

impl IntoResponse for Failure {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"message": self.1}))).into_response()
    }
}

impl Accounts {
    pub(super) fn open(data: &Path) -> io::Result<Self> {
        let directory = data.join("accounts");
        DirBuilder::new()
            .mode(0o700)
            .recursive(true)
            .create(&directory)?;
        let metadata = directory.symlink_metadata()?;
        if !metadata.is_dir() || metadata.permissions().mode() & 0o077 != 0 {
            return Err(io::Error::other("The accounts directory must be private"));
        }
        let accounts = Self {
            file: directory.join("accounts.json"),
            writer: Mutex::new(()),
            sessions: Mutex::new(BTreeMap::new()),
            attempts: Mutex::new(Attempts::new(Instant::now())),
            workers: Arc::new(Semaphore::new(2)),
        };
        accounts.read()?;
        Ok(accounts)
    }

    fn read(&self) -> io::Result<Records> {
        let metadata = match self.file.symlink_metadata() {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Records::default()),
            Err(error) => return Err(error),
        };
        if !metadata.is_file()
            || metadata.permissions().mode() & 0o077 != 0
            || metadata.len() > MAX_STORE_BYTES
        {
            return Err(io::Error::other("Invalid account data file"));
        }
        let mut bytes = Vec::new();
        File::open(&self.file)?
            .take(MAX_STORE_BYTES + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_STORE_BYTES {
            return Err(io::Error::other("Account data file is too large"));
        }
        let records: Records = serde_json::from_slice(&bytes)?;
        if records.version != 1
            || records.members.len() > MAX_MEMBERS
            || records.invites.len() > MAX_INVITES
        {
            return Err(io::Error::other("Unsupported account data"));
        }
        Ok(records)
    }

    fn update<T>(
        &self,
        update: impl FnOnce(&mut Records) -> Result<T, Failure>,
    ) -> Result<T, Failure> {
        let _writer = self.writer.lock().map_err(|_| UNAVAILABLE)?;
        let mut records = self.read().map_err(|_| UNAVAILABLE)?;
        let result = update(&mut records)?;
        admin_store::write_json(&self.file, &records).map_err(|_| UNAVAILABLE)?;
        Ok(result)
    }

    fn check_attempt(&self, identifier: &str) -> Result<(), Failure> {
        let now = Instant::now();
        let mut attempts = self.attempts.lock().map_err(|_| UNAVAILABLE)?;
        if now.duration_since(attempts.start) >= ATTEMPT_WINDOW {
            *attempts = Attempts::new(now);
        }
        if attempts.total >= MAX_ATTEMPTS {
            return Err(LIMITED);
        }
        let count = attempts
            .by_identifier
            .entry(identifier.to_owned())
            .or_default();
        if *count >= MAX_ATTEMPTS_PER_IDENTIFIER {
            return Err(LIMITED);
        }
        *count += 1;
        attempts.total += 1;
        Ok(())
    }

    fn issue(&self, principal: Principal) -> Result<Response, Failure> {
        let token = hex(&random_bytes::<32>()?);
        let now = Instant::now();
        let mut sessions = self.sessions.lock().map_err(|_| UNAVAILABLE)?;
        sessions.retain(|_, session| session.expires > now);
        let account_sessions: Vec<_> = sessions
            .iter()
            .filter(|(_, session)| session.principal.id == principal.id)
            .collect();
        if account_sessions.len() >= MAX_SESSIONS_PER_ACCOUNT
            && let Some((oldest, _)) = account_sessions
                .iter()
                .min_by_key(|(_, session)| session.expires)
        {
            let oldest = (*oldest).clone();
            sessions.remove(&oldest);
        }
        let limit = if principal.role == Role::Operator {
            MAX_SESSIONS
        } else {
            MAX_SESSIONS - MAX_SESSIONS_PER_ACCOUNT
        };
        if sessions.len() >= limit {
            return Err(UNAVAILABLE);
        }
        let body = Json(principal.clone());
        sessions.insert(
            token_digest(&token),
            Session {
                principal,
                expires: now + SESSION_TTL,
            },
        );
        let cookie = session_header(&token, SESSION_TTL.as_secs());
        Ok(([(header::SET_COOKIE, cookie)], body).into_response())
    }

    fn principal(&self, headers: &HeaderMap) -> Option<Principal> {
        let key = session_key(headers)?;
        let sessions = self.sessions.lock().ok()?;
        let session = sessions.get(&key)?;
        (session.expires > Instant::now()).then(|| session.principal.clone())
    }

    fn invite(&self, email: String) -> Result<String, Failure> {
        let now = unix_seconds()?;
        let token = hex(&random_bytes::<32>()?);
        self.update(|records| {
            if records.members.contains_key(&email) {
                return Err(CONFLICT);
            }
            records
                .invites
                .retain(|_, invitation| invitation.expires > now && invitation.email != email);
            if records.invites.len() >= MAX_INVITES {
                return Err(LIMITED);
            }
            records.invites.insert(
                token_digest(&token),
                Invitation {
                    email,
                    expires: now + INVITE_TTL.as_secs(),
                },
            );
            Ok(token)
        })
    }

    fn accept_invite(
        &self,
        key: &str,
        password: PasswordHash,
        operator: Option<&str>,
    ) -> Result<Principal, Failure> {
        let now = unix_seconds()?;
        self.update(|records| {
            let invitation = records
                .invites
                .remove(key)
                .filter(|invitation| invitation.expires > now)
                .ok_or(INVITE_INVALID)?;
            let email = invitation.email;
            if reserved(&email, operator) || records.members.contains_key(&email) {
                return Err(INVITE_INVALID);
            }
            if records.members.len() >= MAX_MEMBERS {
                return Err(UNAVAILABLE);
            }
            let id = member_id()?;
            records.members.insert(
                email.clone(),
                Member {
                    id: id.clone(),
                    password,
                },
            );
            Ok(Principal {
                id,
                identifier: email,
                role: Role::Member,
            })
        })
    }
}

pub(super) fn admin_access(site: &Site, headers: &HeaderMap) -> Option<bool> {
    site.accounts
        .as_ref()?
        .principal(headers)
        .map(|principal| principal.role == Role::Operator)
}

pub(super) fn routes() -> Router<Arc<Site>> {
    Router::new()
        .route("/sign-in", post(sign_in))
        .route("/signup", post(sign_up))
        .route("/session", get(session))
        .route("/sign-out", post(sign_out))
        .route("/invitations", post(invitation))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(middleware::from_fn(guard))
}

async fn guard(request: axum::extract::Request, next: Next) -> Response {
    let headers = request.headers();
    let valid_host =
        headers.get_all(header::HOST).iter().count() == 1 && host(headers).as_deref() == Some(APEX);
    let valid_origin = headers.get_all(header::ORIGIN).iter().count() == 1
        && headers
            .get(header::ORIGIN)
            .is_some_and(|origin| origin == APEX_ORIGIN);
    let mut response = if !valid_host {
        MISSING.into_response()
    } else if !request.method().is_safe() && !valid_origin {
        FORBIDDEN.into_response()
    } else {
        next.run(request).await
    };
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    response
}

async fn work<T: Send + 'static>(
    site: Arc<Site>,
    action: impl FnOnce(&Site, &Accounts) -> Result<T, Failure> + Send + 'static,
) -> Result<T, Failure> {
    let accounts = site.accounts.as_ref().ok_or(UNAVAILABLE)?;
    let permit = Arc::clone(&accounts.workers)
        .try_acquire_owned()
        .map_err(|_| LIMITED)?;
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        action(&site, site.accounts.as_ref().ok_or(UNAVAILABLE)?)
    })
    .await
    .map_err(|_| UNAVAILABLE)?
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LoginInput {
    identifier: String,
    password: String,
}

async fn sign_in(
    State(site): State<Arc<Site>>,
    input: Result<Json<LoginInput>, JsonRejection>,
) -> Result<Response, Failure> {
    let LoginInput {
        identifier,
        password,
    } = body(input)?;
    let identifier = identifier.trim().to_owned();
    if identifier.is_empty()
        || identifier.len() > 254
        || password.is_empty()
        || password.len() > MAX_PASSWORD_BYTES
        || password.contains('\0')
    {
        return Err(INVALID);
    }
    // The configured operator credential has its own high-entropy verifier.
    // Keep authorized recovery available when ordinary password checks are busy.
    if let Some(operator) = site.admin.as_ref()
        && reserved(&identifier, Some(operator.operator_username()))
        && operator.verify(operator.operator_username(), &password)
    {
        return site.accounts.as_ref().ok_or(UNAVAILABLE)?.issue(Principal {
            id: OPERATOR_ID.to_owned(),
            identifier: operator.operator_username().to_owned(),
            role: Role::Operator,
        });
    }
    work(site, move |site, accounts| {
        accounts.check_attempt(&identifier.to_ascii_lowercase())?;
        let operator = site.admin.as_ref().map(|admin| admin.operator_username());
        let records = accounts.read().map_err(|_| UNAVAILABLE)?;
        let email = normalize_email(&identifier);
        let member = if !reserved(&identifier, operator) {
            email.as_ref().and_then(|email| records.members.get(email))
        } else {
            None
        };
        let allowed = PasswordHash::verify(&password, member.map(|member| &member.password));
        let member = member.filter(|_| allowed).ok_or(INVALID_LOGIN)?;
        accounts.issue(Principal {
            id: member.id.clone(),
            identifier: email.ok_or(INVALID_LOGIN)?,
            role: Role::Member,
        })
    })
    .await
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SignupInput {
    invite: String,
    password: String,
}

async fn sign_up(
    State(site): State<Arc<Site>>,
    input: Result<Json<SignupInput>, JsonRejection>,
) -> Result<Response, Failure> {
    let SignupInput { invite, password } = body(input)?;
    if !valid_token(&invite) {
        return Err(INVITE_INVALID);
    }
    if password.len() > MAX_PASSWORD_BYTES
        || !(15..=128).contains(&password.chars().count())
        || password.chars().any(char::is_control)
    {
        return Err(INVALID);
    }
    work(site, move |site, accounts| {
        let key = token_digest(&invite);
        accounts.check_attempt(&key)?;
        let now = unix_seconds()?;
        if accounts
            .read()
            .map_err(|_| UNAVAILABLE)?
            .invites
            .get(&key)
            .is_none_or(|invite| invite.expires <= now)
        {
            return Err(INVITE_INVALID);
        }
        let credential = PasswordHash::derive(&password)?;
        let operator = site.admin.as_ref().map(|admin| admin.operator_username());
        let principal = accounts.accept_invite(&key, credential, operator)?;
        // The account and invitation update is already durable. If no browser
        // session can be issued now, let the new member continue to sign in.
        Ok(accounts.issue(principal.clone()).unwrap_or_else(|_| {
            (
                StatusCode::CREATED,
                [(header::SET_COOKIE, session_header("", 0))],
                Json(principal),
            )
                .into_response()
        }))
    })
    .await
}

async fn session(
    State(site): State<Arc<Site>>,
    headers: HeaderMap,
) -> Result<Json<Principal>, Failure> {
    site.accounts
        .as_ref()
        .ok_or(UNAVAILABLE)?
        .principal(&headers)
        .map(Json)
        .ok_or(SIGN_IN)
}

async fn sign_out(State(site): State<Arc<Site>>, headers: HeaderMap) -> Result<Response, Failure> {
    let accounts = site.accounts.as_ref().ok_or(UNAVAILABLE)?;
    if let Some(key) = session_key(&headers) {
        accounts
            .sessions
            .lock()
            .map_err(|_| UNAVAILABLE)?
            .remove(&key);
    }
    Ok((
        StatusCode::NO_CONTENT,
        [(header::SET_COOKIE, session_header("", 0))],
    )
        .into_response())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct InviteInput {
    email: String,
}

async fn invitation(
    State(site): State<Arc<Site>>,
    headers: HeaderMap,
    input: Result<Json<InviteInput>, JsonRejection>,
) -> Result<Json<serde_json::Value>, Failure> {
    if !admin_access(&site, &headers).ok_or(SIGN_IN)? {
        return Err(FORBIDDEN);
    }
    let email = normalize_email(&body(input)?.email).ok_or(INVALID)?;
    let operator = site.admin.as_ref().map(|admin| admin.operator_username());
    if reserved(&email, operator) {
        return Err(CONFLICT);
    }
    let invite = work(site, move |_, accounts| accounts.invite(email)).await?;
    Ok(Json(json!({"invite": invite})))
}

fn body<T>(input: Result<Json<T>, JsonRejection>) -> Result<T, Failure> {
    input
        .map(|Json(value)| value)
        .map_err(|error| Failure(error.status(), INVALID.1))
}

fn normalize_email(value: &str) -> Option<String> {
    let value = value.trim();
    if value.len() > 254 {
        return None;
    }
    let (local, domain) = value.split_once('@')?;
    let valid_local = !local.is_empty()
        && local.len() <= 64
        && !local.starts_with('.')
        && !local.ends_with('.')
        && !local.contains("..")
        && local
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._+-".contains(&byte));
    let valid_domain = domain.contains('.')
        && domain.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        });
    (valid_local && valid_domain).then(|| value.to_ascii_lowercase())
}

fn reserved(identifier: &str, operator: Option<&str>) -> bool {
    operator.is_some_and(|name| name.eq_ignore_ascii_case(identifier))
}

fn session_key(headers: &HeaderMap) -> Option<String> {
    let mut values = headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .filter_map(|value| {
            let (name, token) = value.trim().split_once('=')?;
            (name == COOKIE).then_some(token)
        });
    let token = values.next()?;
    (values.next().is_none() && valid_token(token)).then(|| token_digest(token))
}

fn session_header(token: &str, max_age: u64) -> String {
    format!("{COOKIE}={token}; Max-Age={max_age}; {COOKIE_ATTRIBUTES}")
}

fn valid_token(token: &str) -> bool {
    token.len() == 64
        && token
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn token_digest(token: &str) -> String {
    hex(digest::digest(&digest::SHA256, token.as_bytes()).as_ref())
}

fn hex(value: &[u8]) -> String {
    value.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn random_bytes<const N: usize>() -> Result<[u8; N], Failure> {
    let mut bytes = [0; N];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| UNAVAILABLE)?;
    Ok(bytes)
}

fn member_id() -> Result<String, Failure> {
    let mut bytes = random_bytes::<16>()?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let value = hex(&bytes);
    let id = format!(
        "{}-{}-{}-{}-{}",
        &value[..8],
        &value[8..12],
        &value[12..16],
        &value[16..20],
        &value[20..]
    );
    (id != OPERATOR_ID).then_some(id).ok_or(UNAVAILABLE)
}

fn unix_seconds() -> Result<u64, Failure> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|_| UNAVAILABLE)
}

#[cfg(test)]
#[path = "accounts_tests.rs"]
mod tests;
