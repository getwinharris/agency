//! First-party static sites, MediaHub intake, and operator administration.

mod admin;
mod admin_store;
mod inquiry;
#[cfg(test)]
mod tests;

use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, Method, StatusCode, Uri, header, uri::Authority},
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
};
use serde_json::json;
use std::{
    env,
    fs::{DirBuilder, File},
    io::{self, Read},
    net::SocketAddr,
    os::unix::fs::{DirBuilderExt, PermissionsExt},
    path::{Path, PathBuf},
    sync::Arc,
};

const MEDIAHUB: &str = "mediahub.bapx.in";
const MEDIAHUB_ORIGIN: &str = "https://mediahub.bapx.in";
const INQUIRY_PATH: &str = "/api/mediahub/inquiries";
const MAX_INQUIRY_BYTES: usize = 16 * 1024;
const MAX_STATIC_BYTES: u64 = 32 * 1024 * 1024;

#[cfg(target_os = "linux")]
mod published;

struct Site {
    root: PathBuf,
    inquiries: PathBuf,
    mediahub_copy: PathBuf,
    admin: Option<admin::Admin>,
    #[cfg(target_os = "linux")]
    published: Option<Arc<published::PublishedSites>>,
}

pub async fn serve() -> Result<(), Box<dyn std::error::Error>> {
    let listen: SocketAddr = env::var("BAPX_WEB_LISTEN")
        .unwrap_or_else(|_| "127.0.0.1:8080".into())
        .parse()?;
    let root = env::var_os("BAPX_WEB_ROOT").ok_or("BAPX_WEB_ROOT is required")?;
    let data = env::var_os("BAPX_WEB_DATA").ok_or("BAPX_WEB_DATA is required")?;
    let mut site = Site::open(root.as_ref(), data.as_ref())?;
    #[cfg(target_os = "linux")]
    if let Some(published) = env::var_os("BAPX_SITE_RELEASE_ROOT") {
        site.enable_published(published.as_ref())?;
    }
    site.admin = match admin::Admin::from_env() {
        Ok(admin) => admin,
        Err(error) => {
            eprintln!("Admin authentication is disabled ({})", error.kind());
            None
        }
    };
    let listener = tokio::net::TcpListener::bind(listen).await?;
    eprintln!("bapx-web listening on {}", listener.local_addr()?);
    axum::serve(listener, router(site)).await?;
    Ok(())
}

impl Site {
    #[cfg(target_os = "linux")]
    fn enable_published(&mut self, path: &Path) -> io::Result<()> {
        let directory = path.canonicalize()?;
        let data = self.inquiries.parent().expect("data contains inquiries");
        if [&self.root, data]
            .iter()
            .any(|other| directory.starts_with(other) || other.starts_with(&directory))
        {
            return Err(io::Error::other(
                "Website releases must be stored outside first-party web roots",
            ));
        }
        self.published = Some(Arc::new(published::PublishedSites::open(path)?));
        Ok(())
    }

    fn open(root: &Path, data: &Path) -> io::Result<Self> {
        let root = root.canonicalize()?;
        for page in [
            "index.html",
            "privacy/index.html",
            "mediahub/index.html",
            "docs/index.html",
        ] {
            let path = root.join(page).canonicalize()?;
            if !path.starts_with(&root) || !path.is_file() {
                return Err(io::Error::other(format!("Invalid site page {page}")));
            }
        }

        DirBuilder::new().mode(0o700).recursive(true).create(data)?;
        let data = data.canonicalize()?;
        if data.starts_with(&root) || root.starts_with(&data) {
            return Err(io::Error::other(
                "BAPX_WEB_ROOT and BAPX_WEB_DATA must be separate directories",
            ));
        }
        let inquiries = data.join("inquiries");
        DirBuilder::new()
            .mode(0o700)
            .recursive(true)
            .create(&inquiries)?;
        let metadata = inquiries.symlink_metadata()?;
        if !metadata.is_dir() || metadata.permissions().mode() & 0o077 != 0 {
            return Err(io::Error::other(
                "The inquiries directory must be private (0700)",
            ));
        }
        Ok(Self {
            root,
            inquiries,
            mediahub_copy: data.join("mediahub-homepage.json"),
            admin: None,
            #[cfg(target_os = "linux")]
            published: None,
        })
    }
}

fn router(site: Site) -> Router {
    let state = Arc::new(site);
    let router = Router::new()
        .route("/healthz", get(health))
        .route("/favicon.svg", get(favicon))
        .route(
            INQUIRY_PATH,
            post(inquiry::accept).layer(DefaultBodyLimit::max(MAX_INQUIRY_BYTES)),
        )
        .nest("/api/admin", admin::routes())
        .fallback(static_page)
        .with_state(Arc::clone(&state));
    #[cfg(target_os = "linux")]
    let router = router.layer(axum::middleware::from_fn_with_state(
        state,
        published::dispatch,
    ));
    router
}

fn host(headers: &HeaderMap) -> Option<String> {
    let authority: Authority = headers.get(header::HOST)?.to_str().ok()?.parse().ok()?;
    Some(authority.host().to_ascii_lowercase())
}

fn public_host(host: &str) -> bool {
    matches!(host, "bapx.in" | "www.bapx.in" | MEDIAHUB | "docs.bapx.in")
}

async fn health(headers: HeaderMap) -> Response {
    match host(&headers).as_deref() {
        Some(name)
            if public_host(name)
                || matches!(name, admin::HOST | "localhost" | "127.0.0.1" | "[::1]") =>
        {
            let revision = env::var("BAPX_WEB_REVISION")
                .ok()
                .filter(|sha| sha.len() == 40 && sha.bytes().all(|byte| byte.is_ascii_hexdigit()));
            (
                [(header::CACHE_CONTROL, "no-store")],
                Json(json!({"ready": true, "service": "bapx-web", "revision": revision})),
            )
                .into_response()
        }
        _ => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn favicon(headers: HeaderMap) -> Response {
    if host(&headers)
        .as_deref()
        .is_some_and(|name| public_host(name) || name == admin::HOST)
    {
        Redirect::permanent("/brand/favicon.svg").into_response()
    } else {
        StatusCode::NOT_FOUND.into_response()
    }
}

fn asset_type(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "avif" => Some("image/avif"),
        "css" => Some("text/css; charset=utf-8"),
        "gif" => Some("image/gif"),
        "html" => Some("text/html; charset=utf-8"),
        "ico" => Some("image/vnd.microsoft.icon"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "js" | "mjs" => Some("text/javascript; charset=utf-8"),
        "json" => Some("application/json"),
        "md" | "txt" => Some("text/plain; charset=utf-8"),
        "mp4" => Some("video/mp4"),
        "pdf" => Some("application/pdf"),
        "png" => Some("image/png"),
        "svg" => Some("image/svg+xml"),
        "ttf" => Some("font/ttf"),
        "wasm" => Some("application/wasm"),
        "webm" => Some("video/webm"),
        "webmanifest" => Some("application/manifest+json"),
        "webp" => Some("image/webp"),
        "woff" => Some("font/woff"),
        "woff2" => Some("font/woff2"),
        "xml" => Some("application/xml"),
        _ => None,
    }
}

fn safe_segment(segment: &str) -> bool {
    !segment.is_empty()
        && !segment.starts_with('.')
        && segment
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
}

fn static_path(name: &str, path: &str) -> Option<PathBuf> {
    if !public_host(name) && name != admin::HOST {
        return None;
    }
    let relative = path.strip_prefix('/')?;
    let relative = relative.strip_suffix('/').unwrap_or(relative);
    if !relative.is_empty() && !relative.split('/').all(safe_segment) {
        return None;
    }
    if matches!(relative, "favicon.ico" | "favicon-96x96.png") {
        return Some(Path::new("brand").join(relative));
    }
    if name == admin::HOST {
        return match relative {
            "" => Some("admin/index.html".into()),
            "admin/index.css"
            | "admin/index.js"
            | "brand/favicon.svg"
            | "brand/mark.svg"
            | "brand/lockup.css"
            | "brand/great-vibes/GreatVibes-Regular.ttf"
            | "brand/great-vibes/OFL.txt"
            | "brand/bapx-logo-main.svg" => Some(relative.into()),
            _ => None,
        };
    }
    if relative == "site.css" || relative.starts_with("brand/") {
        return Some(relative.into());
    }
    match (name, relative) {
        ("bapx.in" | "www.bapx.in", "" | "index.html") => Some("index.html".into()),
        ("bapx.in" | "www.bapx.in", "privacy") => Some("privacy/index.html".into()),
        (MEDIAHUB, "") => Some("mediahub/index.html".into()),
        (MEDIAHUB, path) if path.starts_with("mediahub/") => Some(path.into()),
        (MEDIAHUB, path) if path.starts_with("clients/") => {
            let slug = path.strip_prefix("clients/")?;
            if !safe_segment(slug) || slug.contains('.') {
                return None;
            }
            Some(Path::new("mediahub/clients").join(slug).join("index.html"))
        }
        ("docs.bapx.in", "" | "docs") => Some("docs/index.html".into()),
        ("docs.bapx.in", path) => {
            let path = Path::new(path.strip_prefix("docs/").unwrap_or(path));
            let path = Path::new("docs").join(path);
            Some(if path.extension().is_some() {
                path
            } else {
                path.join("index.html")
            })
        }
        _ => None,
    }
}

async fn static_page(
    State(site): State<Arc<Site>>,
    headers: HeaderMap,
    method: Method,
    uri: Uri,
) -> Response {
    let name = host(&headers);
    let is_admin = name.as_deref() == Some(admin::HOST);
    if is_admin && site.admin.is_none() {
        return StatusCode::NOT_FOUND.into_response();
    }
    let Some(path) = name.and_then(|name| static_path(&name, uri.path())) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if !matches!(method, Method::GET | Method::HEAD) {
        return (
            StatusCode::METHOD_NOT_ALLOWED,
            [(header::ALLOW, "GET, HEAD")],
        )
            .into_response();
    }
    let Some(content_type) = asset_type(&path) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let head = method == Method::HEAD;
    let is_mediahub_home = path == Path::new("mediahub/index.html");
    let Ok(Ok((size, body))) = tokio::task::spawn_blocking(move || {
        let file = site.root.join(path).canonicalize()?;
        if !file.starts_with(&site.root) || !file.is_file() {
            return Err(io::Error::from(io::ErrorKind::NotFound));
        }
        let file = File::open(file)?;
        let mut size = file.metadata()?.len();
        if size > MAX_STATIC_BYTES {
            return Err(io::Error::from(io::ErrorKind::NotFound));
        }
        let mut contents = Vec::new();
        if !head || is_mediahub_home {
            file.take(MAX_STATIC_BYTES + 1).read_to_end(&mut contents)?;
            if contents.len() as u64 != size {
                return Err(io::Error::other("Static artifact changed while serving"));
            }
        }
        if is_mediahub_home {
            contents = admin_store::render_mediahub_home(&site.mediahub_copy, contents);
            size = contents.len() as u64;
            if head {
                contents.clear();
            }
        }
        Ok((size, contents))
    })
    .await
    else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let cache = if is_admin {
        "no-store"
    } else if content_type.starts_with("text/html") {
        "no-cache"
    } else {
        "public, max-age=3600"
    };
    let mut response = static_response(Body::from(body), size, content_type, cache);
    if is_admin {
        let headers = response.headers_mut();
        headers.insert(
            header::CONTENT_SECURITY_POLICY,
            admin::CONTENT_SECURITY_POLICY
                .parse()
                .expect("valid header"),
        );
        headers.insert(header::REFERRER_POLICY, "no-referrer".parse().unwrap());
        headers.insert("x-robots-tag", "noindex, nofollow".parse().unwrap());
    }
    response
}

fn static_response(body: Body, size: u64, content_type: &str, cache: &str) -> Response {
    let mut response = body.into_response();
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        content_type.parse().expect("valid content type"),
    );
    headers.insert(header::CONTENT_LENGTH, size.into());
    headers.insert(
        header::CACHE_CONTROL,
        cache.parse().expect("valid cache control"),
    );
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        "nosniff".parse().expect("valid header"),
    );
    headers.insert(
        header::X_FRAME_OPTIONS,
        "DENY".parse().expect("valid header"),
    );
    response
}
