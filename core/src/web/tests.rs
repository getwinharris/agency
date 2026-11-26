use super::*;
use serde_json::Value;
use std::fs;

struct Fixture(PathBuf);

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
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
    for (page, content) in [
        ("index.html", "Landing"),
        ("privacy/index.html", "Privacy"),
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
    let private = fixture.0.join("private.txt");
    fs::write(&private, "private").unwrap();
    std::os::unix::fs::symlink(private, root.join("brand/private.txt")).unwrap();
    let site = Site::open(&root, &data).unwrap();
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
