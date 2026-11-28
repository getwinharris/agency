use super::*;
use serde_json::Value;
use std::fs;

struct Fixture(PathBuf);

impl Fixture {
    fn open(&self) -> Site {
        let root = self.0.join("site");
        for (page, content) in [
            ("index.html", "Landing"),
            ("privacy/index.html", "Privacy"),
            ("download/index.html", "Download"),
            ("pricing/index.html", "Pricing"),
            ("mediahub/index.html", "MediaHub"),
            ("mediahub/clients/example/index.html", "Story"),
            ("docs/index.html", "Docs"),
            ("brand/favicon.svg", "<svg/>"),
            ("brand/favicon.ico", "ICO"),
            ("brand/favicon-96x96.png", "PNG"),
        ] {
            let path = root.join(page);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }
        Site::open(&root, &self.0.join("data")).unwrap()
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn first_party_brand_assets() {
    let font = "/brand/great-vibes/GreatVibes-Regular.ttf";
    for host in ["bapx.in", "docs.bapx.in", MEDIAHUB, admin::HOST] {
        assert_eq!(static_path(host, font), Some(font[1..].into()));
        assert_eq!(
            static_path(host, "/brand/lockup.css"),
            Some("brand/lockup.css".into())
        );
    }
    assert_eq!(asset_type(Path::new(font)), Some("font/ttf"));
    assert_eq!(static_path("unknown.bapx.in", font), None);
}

#[tokio::test]
async fn account_pages_and_apis_use_only_the_canonical_origin() {
    let operator_password = "disposable-operator-password-long-enough";
    let member_password = "disposable member password";
    let fixture = Fixture(env::temp_dir().join(format!(
        "bapx-account-route-test-{}-{}",
        std::process::id(),
        crate::observability::now_ms()
    )));
    let mut site = fixture.open();
    let sign_in = site.root.join("sign-in/index.html");
    fs::create_dir_all(sign_in.parent().unwrap()).unwrap();
    fs::write(sign_in, "Sign in").unwrap();
    site.accounts = Some(accounts::Accounts::open(&fixture.0.join("data")).unwrap());
    site.admin = Some(admin::Admin::new("test-operator".into(), operator_password).unwrap());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, router(site)).await.unwrap() });
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let get = |host: &str, path: &str| {
        client
            .get(format!("http://{addr}{path}"))
            .header(header::HOST, host)
    };
    let post = |origin: &str, action: &str, body: Value| {
        client
            .post(format!("http://{addr}/api/auth/{action}"))
            .header(header::HOST, APEX)
            .header(header::ORIGIN, origin)
            .json(&body)
    };

    let page = get(APEX, "/sign-in/").send().await.unwrap();
    assert_eq!(page.status(), StatusCode::OK);
    assert_eq!(page.headers()[header::CACHE_CONTROL], "no-store");
    assert_eq!(page.headers()[header::REFERRER_POLICY], "no-referrer");
    assert_eq!(
        get(APEX, "/admin/").send().await.unwrap().status(),
        StatusCode::NOT_FOUND
    );
    for host in ["www.bapx.in", "docs.bapx.in", MEDIAHUB] {
        let redirect = get(host, "/sign-in/?continue=https://untrusted.example/")
            .send()
            .await
            .unwrap();
        assert_eq!(redirect.status(), StatusCode::TEMPORARY_REDIRECT);
        assert_eq!(
            redirect.headers()[header::LOCATION],
            "https://bapx.in/sign-in/"
        );
        assert_eq!(
            get(host, "/api/auth/session")
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::NOT_FOUND
        );
    }
    assert_eq!(
        get(APEX, "/api/auth/session")
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        get("unknown.bapx.in", "/signup/")
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::NOT_FOUND
    );
    let origin = "https://bapx.in";
    let credentials = json!({"identifier": "test-operator", "password": operator_password});
    let cross_origin = post(MEDIAHUB_ORIGIN, "sign-in", credentials.clone())
        .send()
        .await
        .unwrap();
    assert_eq!(cross_origin.status(), StatusCode::FORBIDDEN);
    assert!(!cross_origin.headers().contains_key(header::SET_COOKIE));
    let operator = post(origin, "sign-in", credentials).send().await.unwrap();
    assert_eq!(operator.status(), StatusCode::OK);
    let operator_cookie = cookie_pair(&operator);
    assert_eq!(operator.json::<Value>().await.unwrap()["role"], "operator");
    assert_eq!(
        get(APEX, "/api/admin/session")
            .header(header::COOKIE, &operator_cookie)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    let overview = |cookie: &str| {
        get(APEX, "/api/auth/account-overview").header(header::COOKIE, cookie)
    };
    let anonymous = get(APEX, "/api/auth/account-overview").send().await.unwrap();
    assert_eq!(anonymous.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(anonymous.headers()[header::CACHE_CONTROL], "no-store");
    for host in ["www.bapx.in", "admin.bapx.in", MEDIAHUB, APP] {
        assert_eq!(
            get(host, "/api/auth/account-overview")
                .header(header::COOKIE, &operator_cookie)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::NOT_FOUND
        );
    }
    let empty_overview = overview(&operator_cookie).send().await.unwrap();
    assert_eq!(empty_overview.status(), StatusCode::OK);
    assert_eq!(empty_overview.headers()[header::CACHE_CONTROL], "no-store");
    assert_eq!(
        empty_overview.json::<Value>().await.unwrap(),
        json!({"registeredMembers": 0, "pendingInvitations": 0})
    );
    let invite = post(
        origin,
        "invitations",
        json!({"email": "Member@Example.test"}),
    )
    .header(header::COOKIE, &operator_cookie)
    .send()
    .await
    .unwrap();
    assert_eq!(invite.status(), StatusCode::OK);
    let invite = invite.json::<Value>().await.unwrap()["invite"].clone();
    assert_eq!(
        overview(&operator_cookie)
            .send()
            .await
            .unwrap()
            .json::<Value>()
            .await
            .unwrap(),
        json!({"registeredMembers": 0, "pendingInvitations": 1})
    );
    let signup = json!({"invite": invite, "password": member_password});
    let member = post(origin, "signup", signup.clone()).send().await.unwrap();
    assert_eq!(member.status(), StatusCode::OK);
    let member_cookie = cookie_pair(&member);
    assert_eq!(
        overview(&member_cookie).send().await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        overview(&operator_cookie)
            .send()
            .await
            .unwrap()
            .json::<Value>()
            .await
            .unwrap(),
        json!({"registeredMembers": 1, "pendingInvitations": 0})
    );
    let identity = member.json::<Value>().await.unwrap();
    assert_eq!(identity["role"], "member");
    assert_eq!(identity["identifier"], "member@example.test");
    assert_ne!(
        post(origin, "signup", signup)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    assert_eq!(
        get(APEX, "/api/admin/session")
            .header(header::COOKIE, &member_cookie)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        post(
            origin,
            "invitations",
            json!({"email": "other@example.test"})
        )
        .header(header::COOKIE, &member_cookie)
        .send()
        .await
        .unwrap()
        .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        post(origin, "sign-out", json!({}))
            .header(header::COOKIE, &member_cookie)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        get(APEX, "/api/auth/session")
            .header(header::COOKIE, &member_cookie)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let member_again = post(
        origin,
        "sign-in",
        json!({"identifier": "member@example.test", "password": member_password}),
    )
    .send()
    .await
    .unwrap();
    assert_eq!(member_again.json::<Value>().await.unwrap(), identity);
    server.abort();
}

fn cookie_pair(response: &reqwest::Response) -> String {
    response.headers()[header::SET_COOKIE]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned()
}

#[tokio::test]
async fn public_routes_and_private_intake() {
    let fixture = Fixture(env::temp_dir().join(format!(
        "bapx-web-test-{}-{}",
        std::process::id(),
        crate::observability::now_ms()
    )));
    let root = fixture.0.join("site");
    let data = fixture.0.join("data");
    let site = fixture.open();
    let private = fixture.0.join("private.txt");
    fs::write(&private, "private").unwrap();
    std::os::unix::fs::symlink(private, root.join("brand/private.txt")).unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, router(site)).await.unwrap() });
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let get = |host, path| {
        client
            .get(format!("http://{addr}{path}"))
            .header(header::HOST, host)
    };
    for (host, path, expected) in [
        ("bapx.in", "/", "Landing"),
        ("www.bapx.in", "/index.html", "Landing"),
        ("bapx.in", "/privacy/", "Privacy"),
        (APEX, "/download/", "Download"),
        (APEX, "/pricing/", "Pricing"),
        ("www.bapx.in", "/download/", "Download"),
        ("www.bapx.in", "/pricing/", "Pricing"),
        (MEDIAHUB, "/", "MediaHub"),
        (MEDIAHUB, "/clients/example/", "Story"),
        ("docs.bapx.in", "/", "Docs"),
    ] {
        let response = get(host, path).send().await.unwrap();
        assert_eq!(response.status(), StatusCode::OK, "{host}{path}");
        assert_eq!(response.text().await.unwrap(), expected);
    }
    let health: Value = get("127.0.0.1", "/healthz")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(health["service"], "bapx-web");
    let favicon = get("bapx.in", "/favicon.svg").send().await.unwrap();
    assert_eq!(favicon.headers()[header::LOCATION], "/brand/favicon.svg");
    for (path, mime) in [
        ("/favicon.ico", "image/vnd.microsoft.icon"),
        ("/favicon-96x96.png", "image/png"),
    ] {
        let icon = get("bapx.in", path).send().await.unwrap();
        assert_eq!(icon.status(), StatusCode::OK);
        assert_eq!(icon.headers()[header::CONTENT_TYPE], mime);
    }
    for (host, path) in [
        ("agents.bapx.in", "/"),
        ("bapx.in", "/v1/health"),
        ("bapx.in", "/brand/private.txt"),
        ("bapx.in", "/clients/example/"),
        (MEDIAHUB, "/mediahub/%2e%2e/%2e%2e/inquiries/private.json"),
    ] {
        assert_eq!(
            get(host, path).send().await.unwrap().status(),
            StatusCode::NOT_FOUND
        );
    }

    let mut payload = json!({ "name": "A Name", "email": "TEST@example.test",
        "organisation": "An organisation", "service": "Websites and commerce",
        "budget": "Need help scoping", "timeline": "This quarter",
        "brief": "A public project brief with enough detail.", "consent": true,
        "website": "", "startedAt": (crate::observability::now_ms() - 3_000).to_string() });
    let post = |host, origin, payload: &Value| {
        client
            .post(format!("http://{addr}{INQUIRY_PATH}"))
            .header(header::HOST, host)
            .header(header::ORIGIN, origin)
            .json(payload)
    };
    assert_eq!(
        post("bapx.in", MEDIAHUB_ORIGIN, &payload)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        post(MEDIAHUB, "https://example.test", &payload)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    payload["website"] = json!("spam");
    assert_eq!(
        post(MEDIAHUB, MEDIAHUB_ORIGIN, &payload)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::BAD_REQUEST
    );
    payload["website"] = json!("");
    payload["consent"] = json!(false);
    let invalid = post(MEDIAHUB, MEDIAHUB_ORIGIN, &payload)
        .send()
        .await
        .unwrap();
    assert_eq!(invalid.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(invalid.json::<Value>().await.unwrap()["fields"]["consent"].is_string());
    assert_eq!(fs::read_dir(data.join("inquiries")).unwrap().count(), 0);

    payload["consent"] = json!(true);
    payload["extra"] = json!("z".repeat(MAX_INQUIRY_BYTES));
    assert_eq!(
        post(MEDIAHUB, MEDIAHUB_ORIGIN, &payload)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::PAYLOAD_TOO_LARGE
    );
    payload.as_object_mut().unwrap().remove("extra");
    let response = post(MEDIAHUB, MEDIAHUB_ORIGIN, &payload)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    let response: Value = response.json().await.unwrap();
    let id = response["inquiry"]["id"].as_str().unwrap();
    assert!(id.starts_with("mh_"));
    assert!(response["inquiry"].get("email").is_none());
    let stored = data.join("inquiries").join(format!("{id}.json"));
    assert_eq!(
        stored.metadata().unwrap().permissions().mode() & 0o777,
        0o600
    );
    let stored: Value = serde_json::from_slice(&fs::read(stored).unwrap()).unwrap();
    assert_eq!(stored["email"], "test@example.test");
    assert_eq!(stored["consent"], true);
    assert_eq!(
        get(MEDIAHUB, INQUIRY_PATH).send().await.unwrap().status(),
        StatusCode::METHOD_NOT_ALLOWED
    );
    server.abort();
}

#[cfg(target_os = "linux")]
#[tokio::test]
async fn published_host_serves_its_own_artifacts_and_never_enters_first_party_routes() {
    use crate::site_release::{SiteGrant, SiteStore, stage};

    const PILOT: &str = "sandbox-check.app.bapx.in";
    let build = "var testFixture = 'published';\n".repeat(8192);
    let fixture = Fixture(env::temp_dir().join(format!(
        "bapx-web-published-test-{}-{}",
        std::process::id(),
        crate::observability::now_ms()
    )));
    let mut site = fixture.open();
    fs::set_permissions(&fixture.0, fs::Permissions::from_mode(0o700)).unwrap();
    let published = fixture.0.join("published");
    let users = fixture.0.join("users");
    let dist = users.join("owner/business/projects/website/dist");
    let snapshot = fixture.0.join("staging");
    let grant = SiteGrant {
        slug: "sandbox-check",
        account: "owner",
        business: "business",
        project: "website",
    };
    fs::create_dir_all(&dist).unwrap();
    fs::create_dir(&published).unwrap();
    fs::write(dist.join("index.html"), "<h1>Built site</h1>").unwrap();
    fs::write(dist.join("app.JS"), &build).unwrap();
    fs::write(dist.join("favicon.ico"), b"test bytes").unwrap();
    fs::write(dist.join("data.blob"), b"opaque asset").unwrap();
    fs::write(dist.parent().unwrap().join("source.txt"), "private").unwrap();
    stage(&users, &snapshot, &grant).unwrap();
    SiteStore::open(&published)
        .unwrap()
        .publish(&snapshot, &grant)
        .unwrap();
    fs::remove_dir_all(&users).unwrap();
    fs::remove_dir_all(&snapshot).unwrap();
    assert!(site.enable_published(&fixture.0.join("data")).is_err());
    assert!(site.enable_published(&fixture.0.join("site")).is_err());
    site.enable_published(&published).unwrap();
    site.accounts = Some(accounts::Accounts::open(&fixture.0.join("data")).unwrap());

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, router(site)).await.unwrap() });
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let request = |method, hostname, path| {
        client
            .request(method, format!("http://{addr}{path}"))
            .header(header::HOST, hostname)
    };
    let response = request(Method::GET, PILOT, "/app.JS").send().await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers()[header::CONTENT_TYPE],
        "text/javascript; charset=utf-8"
    );
    assert_eq!(response.headers()[header::CACHE_CONTROL], "no-cache");
    assert_eq!(response.text().await.unwrap(), build);
    let head = request(Method::HEAD, PILOT, "/app.JS")
        .send()
        .await
        .unwrap();
    assert_eq!(head.status(), StatusCode::OK);
    assert_eq!(
        head.headers()[header::CONTENT_TYPE],
        "text/javascript; charset=utf-8"
    );
    assert_eq!(
        head.headers()[header::CONTENT_LENGTH],
        build.len().to_string()
    );
    assert!(head.bytes().await.unwrap().is_empty());
    let icon = request(Method::GET, PILOT, "/favicon.ico")
        .send()
        .await
        .unwrap();
    assert_eq!(icon.status(), StatusCode::OK);
    assert_eq!(icon.bytes().await.unwrap(), "test bytes");
    let opaque = request(Method::GET, PILOT, "/data.blob")
        .send()
        .await
        .unwrap();
    assert_eq!(
        opaque.headers()[header::CONTENT_TYPE],
        "application/octet-stream"
    );
    assert_eq!(opaque.bytes().await.unwrap(), "opaque asset");

    for (method, path, target) in [
        (Method::GET, "/?next=https://outside.invalid/", "/account/"),
        (Method::HEAD, "/", "/account/"),
        (Method::GET, "/account/", "/account/"),
        (Method::GET, "/sign-in/", "/sign-in/"),
        (Method::GET, "/signup/", "/signup/"),
    ] {
        let response = request(method, APP, path).send().await.unwrap();
        assert_eq!(response.status(), StatusCode::TEMPORARY_REDIRECT);
        assert_eq!(
            response.headers()[header::LOCATION],
            format!("{APEX_ORIGIN}{target}")
        );
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
        assert!(response.headers().get(header::SET_COOKIE).is_none());
    }
    let app_health = request(Method::GET, APP, "/healthz").send().await.unwrap();
    assert_eq!(app_health.status(), StatusCode::OK);
    assert_eq!(
        app_health.json::<Value>().await.unwrap()["service"],
        "bapx-web"
    );

    for (method, hostname, path) in [
        (Method::GET, "unknown.app.bapx.in", "/"),
        (Method::POST, APP, "/"),
        (Method::GET, APP, "/api/auth/session"),
        (Method::GET, APP, "/api/admin/session"),
        (Method::GET, APP, "/v1/sessions"),
        (Method::GET, APP, "/not-an-entry-page"),
        (Method::GET, APP, "/brand/favicon.svg"),
        (Method::GET, PILOT, "/source.txt"),
        (Method::GET, PILOT, "/healthz"),
        (Method::GET, PILOT, "/%2e%2e/source.txt"),
        (Method::GET, PILOT, "/api/admin/session"),
        (Method::POST, PILOT, "/api/admin/login"),
        (Method::POST, PILOT, INQUIRY_PATH),
        (Method::GET, PILOT, "/v1/health"),
    ] {
        let response = request(method.clone(), hostname, path)
            .send()
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            StatusCode::NOT_FOUND,
            "{method} {hostname}{path}"
        );
    }
    let blocked = request(Method::POST, PILOT, "/").send().await.unwrap();
    assert_eq!(blocked.status(), StatusCode::METHOD_NOT_ALLOWED);
    assert_eq!(blocked.headers()[header::ALLOW], "GET, HEAD");
    assert_eq!(
        request(Method::GET, "bapx.in", "/healthz")
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    assert_eq!(
        fs::read_dir(fixture.0.join("data/inquiries"))
            .unwrap()
            .count(),
        0
    );
    server.abort();
}
