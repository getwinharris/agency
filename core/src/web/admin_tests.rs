use super::*;
use std::{fs, path::PathBuf};

struct Fixture(PathBuf);

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[tokio::test]
async fn admin_auth_inquiries_and_live_copy() {
    let fixture = Fixture(env::temp_dir().join(format!(
        "bapx-admin-test-{}-{}",
        std::process::id(),
        crate::observability::now_ms()
    )));
    let root = fixture.0.join("site");
    let data = fixture.0.join("data");
    for (page, content) in [
        ("index.html", "Landing"),
        ("privacy/index.html", "Privacy"),
        (
            "mediahub/index.html",
            "<h1><!--agency-headline-->MediaHub<!--/agency-headline--></h1><p><!--agency-brief-intro-->Brief &amp; details<!--/agency-brief-intro--></p>",
        ),
        ("docs/index.html", "Docs"),
        ("admin/index.html", "Admin"),
        ("brand/great-vibes/GreatVibes-Regular.ttf", "Font fixture"),
    ] {
        let path = root.join(page);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }
    let mut site = Site::open(&root, &data).unwrap();
    let id = "mh_7f6d2889-caac-11ee-b50f-32164210df78";
    let inquiry_file = data.join("inquiries").join(format!("{id}.json"));
    fs::write(
        &inquiry_file,
        serde_json::to_vec(&json!({
            "id":id, "createdAt":"2024-02-13T07:03:18.326Z",
            "updatedAt":"2024-02-13T07:03:18.326Z", "status":"new", "email":"client@example.test"
        }))
        .unwrap(),
    )
    .unwrap();

    let password = "temporary-only-Faucet-Earth7.demo";
    site.admin = Some(Admin::new("qa-operator".into(), password).unwrap());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        axum::serve(listener, super::super::router(site))
            .await
            .unwrap()
    });
    let client = reqwest::Client::new();
    let get = |host: &str, path: &str| {
        client
            .get(format!("http://{addr}{path}"))
            .header(header::HOST, host)
    };
    let post = |origin: &str, path: &str, payload: &Value| {
        client
            .post(format!("http://{addr}/api/admin/{path}"))
            .header(header::HOST, HOST)
            .header(header::ORIGIN, origin)
            .json(payload)
    };
    let credentials = json!({ "username": "qa-operator", "password": password });
    let shell = get(HOST, "/").send().await.unwrap();
    assert_eq!(shell.status(), StatusCode::OK);
    assert_eq!(shell.headers()[header::CACHE_CONTROL], "no-store");
    assert_eq!(
        shell.headers()[header::CONTENT_SECURITY_POLICY],
        CONTENT_SECURITY_POLICY
    );
    assert!(
        shell.headers()[header::CONTENT_SECURITY_POLICY]
            .to_str()
            .unwrap()
            .split(';')
            .any(|directive| directive.trim() == "font-src 'self'")
    );
    let font = get(HOST, "/brand/great-vibes/GreatVibes-Regular.ttf")
        .send()
        .await
        .unwrap();
    assert_eq!(font.status(), StatusCode::OK);
    assert_eq!(font.headers()[header::CONTENT_TYPE], "font/ttf");
    assert_eq!(
        get("bapx.in", "/admin/").send().await.unwrap().status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        get(HOST, "/api/admin/inquiries")
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        post("https://mediahub.bapx.in", "login", &credentials)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    let wrong = json!({"username":"someone-else","password":password});
    let failure = post(ORIGIN, "login", &wrong).send().await.unwrap();
    assert_eq!(failure.status(), StatusCode::UNAUTHORIZED);
    assert!(!failure.headers().contains_key(header::SET_COOKIE));
    for _ in 1..LOGIN_FAILURE_BURST {
        let response = post(ORIGIN, "login", &wrong).send().await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
    let throttled = post(ORIGIN, "login", &wrong).send().await.unwrap();
    assert_eq!(throttled.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(throttled.headers().contains_key(header::RETRY_AFTER));
    let response = post(ORIGIN, "login", &credentials).send().await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let cookie = response.headers()[header::SET_COOKIE].to_str().unwrap();
    assert!(cookie.starts_with("__Host-bapx-admin="));
    assert!(cookie.ends_with("Path=/; Secure; HttpOnly; SameSite=Strict"));
    let token = cookie.split(';').next().unwrap();
    assert_eq!(
        get("bapx.in", "/api/admin/inquiries")
            .header(header::COOKIE, token)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::NOT_FOUND
    );

    let response = get(HOST, "/api/admin/inquiries")
        .header(header::COOKIE, token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
    let records: Vec<Value> = response.json().await.unwrap();
    assert_eq!(records.len(), 1);
    assert_eq!(records[0]["id"], id);
    let update = json!({
        "updatedAt": records[0]["updatedAt"],
        "status": "qualified",
        "notes": "Follow-up next week."
    });
    let inquiry_route = format!("inquiries/{id}");
    assert_eq!(
        post("https://mediahub.bapx.in", &inquiry_route, &update)
            .header(header::COOKIE, token)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    let response = post(ORIGIN, &inquiry_route, &update)
        .header(header::COOKIE, token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let record: Value = serde_json::from_slice(&fs::read(&inquiry_file).unwrap()).unwrap();
    assert_eq!(record["status"], "qualified");
    assert_eq!(record["updatedBy"], "qa-operator");
    assert_eq!(record["notes"], "Follow-up next week.");
    assert_eq!(record["email"], "client@example.test");
    assert_eq!(
        inquiry_file.metadata().unwrap().permissions().mode() & 0o777,
        0o600
    );
    assert_eq!(
        post(ORIGIN, &inquiry_route, &update)
            .header(header::COOKIE, token)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::CONFLICT
    );

    let original: Value = get(HOST, "/api/admin/mediahub")
        .header(header::COOKIE, token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(original["briefIntro"], "Brief & details");
    let copy = json!({"headline":"<script> & example","briefIntro":"Contact us","updatedAt":null});
    let published = post(ORIGIN, "mediahub", &copy)
        .header(header::COOKIE, token)
        .send()
        .await
        .unwrap();
    assert_eq!(published.status(), StatusCode::OK);
    let homepage = get("mediahub.bapx.in", "/").send().await.unwrap();
    let get_length = homepage.content_length();
    let html = homepage.text().await.unwrap();
    assert!(html.contains("&lt;script&gt; &amp; example"));
    assert!(html.contains("Contact us"));
    let head = client
        .head(format!("http://{addr}/"))
        .header(header::HOST, "mediahub.bapx.in")
        .send()
        .await
        .unwrap();
    assert_eq!(
        head.headers()[header::CONTENT_LENGTH]
            .to_str()
            .unwrap()
            .parse::<u64>()
            .ok(),
        get_length
    );

    assert_eq!(
        post(ORIGIN, "logout", &json!({}))
            .header(header::COOKIE, token)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        get(HOST, "/api/admin/session")
            .header(header::COOKIE, token)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    server.abort();
}
