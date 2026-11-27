use super::{Site, admin_store, host};
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, State, rejection::JsonRejection},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use ring::{
    hmac,
    rand::{SecureRandom, SystemRandom},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    env,
    fs::File,
    io::{self, Read},
    os::unix::fs::PermissionsExt,
    path::Path as FilePath,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

pub(super) const HOST: &str = "admin.bapx.in";
pub(super) const CONTENT_SECURITY_POLICY: &str = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const ORIGIN: &str = "https://admin.bapx.in";
const COOKIE: &str = "__Host-bapx-admin";
const COOKIE_ATTRIBUTES: &str = "Path=/; Secure; HttpOnly; SameSite=Strict";
const SESSION_TTL: Duration = Duration::from_secs(8 * 60 * 60);
const MAX_SESSIONS: usize = 1024;
const MAX_CREDENTIAL_BYTES: u64 = 256;
const MAX_BODY_BYTES: usize = 16 * 1024;
const LOGIN_WINDOW: Duration = Duration::from_secs(60);
const LOGIN_FAILURE_BURST: u8 = 20;

pub(super) struct Admin {
    username: String,
    login_key: hmac::Key,
    login_tag: hmac::Tag,
    sessions: Mutex<HashMap<String, Instant>>,
    login_failures: Mutex<(Instant, u8)>,
    store: Mutex<()>,
}

impl Admin {
    pub(super) fn from_env() -> io::Result<Option<Self>> {
        let Some(path) = env::var_os("BAPX_ADMIN_PASSWORD_FILE") else {
            return Ok(None);
        };
        let file = File::open(FilePath::new(&path))?;
        let metadata = file.metadata()?;
        if !metadata.is_file() || metadata.permissions().mode() & 0o137 != 0 {
            return Err(io::Error::other(
                "Admin password file permissions must be 0400, 0440 or 0600",
            ));
        }
        let mut password = String::new();
        file.take(MAX_CREDENTIAL_BYTES + 1)
            .read_to_string(&mut password)?;
        if password.len() as u64 > MAX_CREDENTIAL_BYTES {
            return Err(io::Error::other("Admin password file is too large"));
        }
        let username = env::var("BAPX_ADMIN_USERNAME").unwrap_or_else(|_| "operator".into());
        Self::new(username, password.trim_end_matches(['\r', '\n'])).map(Some)
    }

    fn new(username: String, password: &str) -> io::Result<Self> {
        if username.is_empty()
            || username.len() > 64
            || !username
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"._@-".contains(&byte))
        {
            return Err(io::Error::other("Invalid Admin username"));
        }
        if !(32..=200).contains(&password.len())
            || !password.bytes().all(|byte| byte.is_ascii_graphic())
        {
            return Err(io::Error::other(
                "Admin password must be between 32 and 200 printable ASCII characters",
            ));
        }
        let login_key = hmac::Key::generate(hmac::HMAC_SHA256, &SystemRandom::new())
            .map_err(|_| io::Error::other("Failed to initialize Admin authentication"))?;
        let login_tag = hmac::sign(&login_key, &credentials(&username, password));
        Ok(Self {
            username,
            login_key,
            login_tag,
            sessions: Mutex::new(HashMap::new()),
            login_failures: Mutex::new((Instant::now(), 0)),
            store: Mutex::new(()),
        })
    }

    fn verify(&self, username: &str, password: &str) -> bool {
        if username.contains('\0') || password.contains('\0') {
            return false;
        }
        hmac::verify(
            &self.login_key,
            &credentials(username, password),
            self.login_tag.as_ref(),
        )
        .is_ok()
    }

    fn failed_login(&self) -> Result<Response, Failure> {
        let mut failures = self.login_failures.lock().map_err(|_| UNAVAILABLE)?;
        let now = Instant::now();
        if now.duration_since(failures.0) >= LOGIN_WINDOW {
            *failures = (now, 0);
        }
        if failures.1 >= LOGIN_FAILURE_BURST {
            let remaining = LOGIN_WINDOW.saturating_sub(now.duration_since(failures.0));
            let retry_after = remaining.as_secs().saturating_add(1).to_string();
            Ok((
                StatusCode::TOO_MANY_REQUESTS,
                [(header::RETRY_AFTER, retry_after)],
                Json(json!({"message": "Too many sign-in attempts. Try again shortly."})),
            )
                .into_response())
        } else {
            failures.1 += 1;
            Err(INVALID_LOGIN)
        }
    }

    fn issue(&self) -> Result<String, Failure> {
        let mut entropy = [0u8; 32];
        SystemRandom::new()
            .fill(&mut entropy)
            .map_err(|_| UNAVAILABLE)?;
        let token = entropy.map(|byte| format!("{byte:02x}")).join("");
        let now = Instant::now();
        let mut sessions = self.sessions.lock().map_err(|_| UNAVAILABLE)?;
        sessions.retain(|_, expires| *expires > now);
        if sessions.len() >= MAX_SESSIONS {
            return Err(UNAVAILABLE);
        }
        sessions.insert(token.clone(), now + SESSION_TTL);
        Ok(token)
    }

    fn authenticate(&self, headers: &HeaderMap) -> Result<(), Failure> {
        let token = session_cookie(headers).ok_or(SIGN_IN)?;
        let sessions = self.sessions.lock().map_err(|_| UNAVAILABLE)?;
        if sessions
            .get(token)
            .is_some_and(|expires| *expires > Instant::now())
        {
            Ok(())
        } else {
            Err(SIGN_IN)
        }
    }
}

fn credentials(username: &str, password: &str) -> Vec<u8> {
    [username.as_bytes(), b"\0", password.as_bytes()].concat()
}

fn session_cookie(headers: &HeaderMap) -> Option<&str> {
    let cookies = headers.get_all(header::COOKIE);
    let mut candidates = cookies
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .filter_map(|cookie| cookie.trim().split_once('='))
        .filter_map(|(name, value)| (name == COOKIE).then_some(value));
    let token = candidates.next()?;
    if candidates.next().is_none()
        && token.len() == 64
        && token.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        Some(token)
    } else {
        None
    }
}

pub(super) fn routes() -> Router<Arc<Site>> {
    Router::new()
        .route("/session", get(session))
        .route("/login", post(login))
        .route("/logout", post(logout))
        .route("/inquiries", get(inquiries))
        .route("/inquiries/{id}", post(update_inquiry))
        .route("/mediahub", get(mediahub).post(publish_mediahub))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(middleware::from_fn(admin_response))
}

async fn admin_response(request: axum::extract::Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response.headers_mut().insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    response
}

#[derive(Clone, Copy)]
struct Failure(StatusCode, &'static str);

const MISSING: Failure = Failure(StatusCode::NOT_FOUND, "Not found.");
const SIGN_IN: Failure = Failure(StatusCode::UNAUTHORIZED, "Sign in to continue.");
const INVALID_LOGIN: Failure = Failure(
    StatusCode::UNAUTHORIZED,
    "The username or password is incorrect.",
);
const INVALID: Failure = Failure(StatusCode::BAD_REQUEST, "Check the submitted values.");
const UNAVAILABLE: Failure = Failure(
    StatusCode::SERVICE_UNAVAILABLE,
    "Admin is temporarily unavailable.",
);
const CONFLICT: Failure = Failure(
    StatusCode::CONFLICT,
    "Someone updated this record. Refresh before saving.",
);

impl IntoResponse for Failure {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"message": self.1}))).into_response()
    }
}

fn configured<'a>(site: &'a Site, headers: &HeaderMap) -> Result<&'a Admin, Failure> {
    if host(headers).as_deref() != Some(HOST) {
        return Err(MISSING);
    }
    site.admin.as_ref().ok_or(MISSING)
}

fn mutation(headers: &HeaderMap) -> Result<(), Failure> {
    if headers
        .get(header::ORIGIN)
        .is_some_and(|origin| origin == ORIGIN)
        && headers.get_all(header::ORIGIN).iter().count() == 1
    {
        Ok(())
    } else {
        Err(Failure(
            StatusCode::FORBIDDEN,
            "Submit this request from admin.bapx.in.",
        ))
    }
}

fn authenticated<'a>(site: &'a Site, headers: &HeaderMap) -> Result<&'a Admin, Failure> {
    let admin = configured(site, headers)?;
    admin.authenticate(headers)?;
    Ok(admin)
}

fn json_body<T>(body: Result<Json<T>, JsonRejection>) -> Result<T, Failure> {
    body.map(|Json(payload)| payload)
        .map_err(|error| Failure(error.status(), INVALID.1))
}

async fn session(
    State(site): State<Arc<Site>>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let admin = authenticated(&site, &headers)?;
    Ok(Json(json!({"username": admin.username})))
}

#[derive(Deserialize)]
struct Login {
    username: String,
    password: String,
}

async fn login(
    State(site): State<Arc<Site>>,
    headers: HeaderMap,
    body: Result<Json<Login>, JsonRejection>,
) -> Result<Response, Failure> {
    let admin = configured(&site, &headers)?;
    mutation(&headers)?;
    let payload = json_body(body)?;
    if !admin.verify(&payload.username, &payload.password) {
        return admin.failed_login();
    }
    let token = admin.issue()?;
    let cookie = format!(
        "{COOKIE}={token}; Max-Age={}; {COOKIE_ATTRIBUTES}",
        SESSION_TTL.as_secs()
    );
    Ok((
        [(header::SET_COOKIE, cookie)],
        Json(json!({"username": admin.username})),
    )
        .into_response())
}

async fn logout(State(site): State<Arc<Site>>, headers: HeaderMap) -> Result<Response, Failure> {
    let admin = configured(&site, &headers)?;
    mutation(&headers)?;
    if let Some(token) = session_cookie(&headers) {
        admin
            .sessions
            .lock()
            .map_err(|_| UNAVAILABLE)?
            .remove(token);
    }
    let cookie = format!("{COOKIE}=; Max-Age=0; {COOKIE_ATTRIBUTES}");
    Ok((StatusCode::NO_CONTENT, [(header::SET_COOKIE, cookie)]).into_response())
}

fn store_failure(error: io::Error) -> Failure {
    match error.kind() {
        io::ErrorKind::NotFound => MISSING,
        io::ErrorKind::InvalidInput => INVALID,
        io::ErrorKind::AlreadyExists => CONFLICT,
        _ => UNAVAILABLE,
    }
}

async fn with_store<T: Send + 'static>(
    site: Arc<Site>,
    action: impl FnOnce(&Site, &Admin) -> io::Result<T> + Send + 'static,
) -> Result<Json<T>, Failure> {
    tokio::task::spawn_blocking(move || {
        let admin = site.admin.as_ref().ok_or(MISSING)?;
        let _store = admin.store.lock().map_err(|_| UNAVAILABLE)?;
        action(&site, admin).map(Json).map_err(store_failure)
    })
    .await
    .map_err(|_| UNAVAILABLE)?
}

async fn inquiries(
    State(site): State<Arc<Site>>,
    headers: HeaderMap,
) -> Result<Json<Vec<Value>>, Failure> {
    authenticated(&site, &headers)?;
    with_store(site, |site, _| admin_store::inquiries(&site.inquiries)).await
}

async fn update_inquiry(
    State(site): State<Arc<Site>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: Result<Json<admin_store::InquiryUpdate>, JsonRejection>,
) -> Result<Json<Value>, Failure> {
    authenticated(&site, &headers)?;
    mutation(&headers)?;
    let update = json_body(body)?;
    with_store(site, move |site, admin| {
        admin_store::update_inquiry(&site.inquiries, &id, update, &admin.username)
    })
    .await
}

async fn mediahub(
    State(site): State<Arc<Site>>,
    headers: HeaderMap,
) -> Result<Json<admin_store::HomepageCopy>, Failure> {
    authenticated(&site, &headers)?;
    with_store(site, |site, _| {
        admin_store::homepage_copy(&site.root, &site.mediahub_copy)
    })
    .await
}

async fn publish_mediahub(
    State(site): State<Arc<Site>>,
    headers: HeaderMap,
    body: Result<Json<admin_store::HomepageCopy>, JsonRejection>,
) -> Result<Json<admin_store::HomepageCopy>, Failure> {
    authenticated(&site, &headers)?;
    mutation(&headers)?;
    let copy = json_body(body)?;
    with_store(site, move |site, _| {
        admin_store::publish_homepage(&site.root, &site.mediahub_copy, copy)
    })
    .await
}

#[cfg(test)]
#[path = "admin_tests.rs"]
mod tests;
