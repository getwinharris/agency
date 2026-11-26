use super::{MEDIAHUB, MEDIAHUB_ORIGIN, Site, host};
use axum::{
    Json,
    body::Bytes,
    extract::{State, rejection::BytesRejection},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use ring::rand::{SecureRandom, SystemRandom};
use serde_json::{Map, Value, json};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    os::unix::fs::OpenOptionsExt,
    path::Path,
    sync::Arc,
};

type InquiryError = (StatusCode, &'static str, &'static str);

const INVALID_REQUEST: InquiryError = (
    StatusCode::BAD_REQUEST,
    "invalid_request",
    "Submit the project brief form again.",
);

fn inquiry_error((status, error, message): InquiryError, fields: Map<String, Value>) -> Response {
    (
        status,
        [(header::CACHE_CONTROL, "no-store")],
        Json(json!({ "error": error, "message": message, "fields": fields })),
    )
        .into_response()
}

pub(super) async fn accept(
    State(site): State<Arc<Site>>,
    headers: HeaderMap,
    body: Result<Bytes, BytesRejection>,
) -> Response {
    let error = |details| inquiry_error(details, Map::new());
    if host(&headers).as_deref() != Some(MEDIAHUB) {
        return StatusCode::NOT_FOUND.into_response();
    }
    if headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        != Some(MEDIAHUB_ORIGIN)
    {
        return error((
            StatusCode::FORBIDDEN,
            "cross_origin_forbidden",
            "Submit this brief from mediahub.bapx.in.",
        ));
    }
    let body = match body {
        Ok(body) => body,
        Err(rejection) if rejection.status() == StatusCode::PAYLOAD_TOO_LARGE => {
            return error((
                StatusCode::PAYLOAD_TOO_LARGE,
                "payload_too_large",
                "The project brief is too large.",
            ));
        }
        Err(_) => return error(INVALID_REQUEST),
    };
    if !headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| {
            value
                .split(';')
                .next()
                .is_some_and(|value| value.trim().eq_ignore_ascii_case("application/json"))
        })
    {
        return error(INVALID_REQUEST);
    }
    let Ok(Value::Object(payload)) = serde_json::from_slice(&body) else {
        return error(INVALID_REQUEST);
    };
    if !field(&payload, "website", 200).is_empty() {
        return error((
            StatusCode::BAD_REQUEST,
            "spam_rejected",
            "Your brief could not be submitted.",
        ));
    }
    let now = crate::observability::now_ms();
    let age = payload
        .get("startedAt")
        .and_then(|value| value.as_u64().or_else(|| value.as_str()?.parse().ok()))
        .and_then(|started| now.checked_sub(started));
    if !age.is_some_and(|age| (2_000..=86_400_000).contains(&age)) {
        return error((
            StatusCode::BAD_REQUEST,
            "invalid_form_session",
            "Refresh the page and try again.",
        ));
    }
    let mut record = match validate(&payload) {
        Ok(record) => record,
        Err(fields) => {
            return inquiry_error(
                (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "validation_failed",
                    "Check the highlighted fields.",
                ),
                fields,
            );
        }
    };
    record["source"] = json!({
        "page": public_url(&payload, "page", 240),
        "referrer": public_url(&payload, "referrer", 500),
        "utmSource": field(&payload, "utmSource", 120),
        "utmMedium": field(&payload, "utmMedium", 120),
        "utmCampaign": field(&payload, "utmCampaign", 120),
        "utmContent": field(&payload, "utmContent", 120),
        "device": payload.get("device").and_then(Value::as_str)
            .filter(|device| matches!(*device, "mobile" | "tablet" | "desktop"))
            .unwrap_or("unknown"),
    });
    let result =
        tokio::task::spawn_blocking(move || store_inquiry(&site.inquiries, record, now)).await;
    match result {
        Ok(Ok(id)) => (
            StatusCode::CREATED,
            [(header::CACHE_CONTROL, "no-store")],
            Json(json!({
                "inquiry": { "id": id, "createdAt": now },
                "message": "Project brief submitted."
            })),
        )
            .into_response(),
        Ok(Err(_)) | Err(_) => {
            eprintln!("bapx-web could not persist a MediaHub inquiry");
            error((
                StatusCode::SERVICE_UNAVAILABLE,
                "inquiry_storage_unavailable",
                "We could not confirm your brief. Please try again.",
            ))
        }
    }
}

fn field(payload: &Map<String, Value>, key: &str, limit: usize) -> String {
    let input = payload.get(key).and_then(Value::as_str).unwrap_or_default();
    let mut clean = String::new();
    let mut space = false;
    let mut length = 0;
    for character in input.chars() {
        if character.is_control() || character.is_whitespace() {
            space = length > 0;
            continue;
        }
        if length + usize::from(space) >= limit {
            break;
        }
        if space {
            clean.push(' ');
            length += 1;
            space = false;
        }
        clean.push(character);
        length += 1;
    }
    clean
}

fn public_url(payload: &Map<String, Value>, key: &str, limit: usize) -> String {
    let Ok(mut url) = reqwest::Url::parse(&field(payload, key, limit)) else {
        return String::new();
    };
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return String::new();
    }
    url.set_query(None);
    url.set_fragment(None);
    url.as_str().chars().take(limit).collect()
}

fn valid_email(email: &str) -> bool {
    let Some((user, domain)) = email.split_once('@') else {
        return false;
    };
    !user.is_empty()
        && !domain.contains('@')
        && !email.chars().any(char::is_whitespace)
        && domain
            .split_once('.')
            .is_some_and(|(first, rest)| !first.is_empty() && !rest.is_empty())
}

fn validate(payload: &Map<String, Value>) -> Result<Value, Map<String, Value>> {
    let name = field(payload, "name", 100);
    let email = field(payload, "email", 254).to_lowercase();
    let phone = field(payload, "phone", 24);
    let organisation = field(payload, "organisation", 120);
    let service = field(payload, "service", 80);
    let budget = field(payload, "budget", 60);
    let timeline = field(payload, "timeline", 60);
    let brief: String = payload
        .get("brief")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .trim()
        .chars()
        .take(4_000)
        .collect();
    let consent = payload.get("consent").and_then(Value::as_bool) == Some(true);

    let checks = [
        (name.chars().count() >= 2, "name", "Enter your name."),
        (valid_email(&email), "email", "Enter a valid work email."),
        (
            phone.is_empty()
                || (phone.len() >= 7
                    && phone
                        .bytes()
                        .all(|b| b.is_ascii_digit() || b"+()- ".contains(&b))),
            "phone",
            "Enter a valid phone number or leave it blank.",
        ),
        (
            organisation.chars().count() >= 2,
            "organisation",
            "Enter your organisation.",
        ),
        (
            matches!(
                service.as_str(),
                "Brand strategy and identity"
                    | "Content and production"
                    | "Social Media Management"
                    | "Digital Marketing"
                    | "Websites and commerce"
                    | "AI, data, and automation"
                    | "Forward-deployed engineering"
            ),
            "service",
            "Choose a service.",
        ),
        (
            matches!(
                budget.as_str(),
                "Under ₹50,000"
                    | "₹50,000–₹1,50,000"
                    | "₹1,50,000–₹5,00,000"
                    | "Above ₹5,00,000"
                    | "Need help scoping"
            ),
            "budget",
            "Choose a budget range.",
        ),
        (
            matches!(
                timeline.as_str(),
                "As soon as possible" | "Within 30 days" | "This quarter" | "Exploring options"
            ),
            "timeline",
            "Choose a timeline.",
        ),
        (
            brief.chars().count() >= 30,
            "brief",
            "Tell us a little more (at least 30 characters).",
        ),
        (
            consent,
            "consent",
            "Consent is required so we can respond to your brief.",
        ),
    ];
    let fields: Map<String, Value> = checks
        .into_iter()
        .filter(|(valid, _, _)| !valid)
        .map(|(_, key, message)| (key.into(), message.into()))
        .collect();
    if !fields.is_empty() {
        return Err(fields);
    }
    Ok(
        json!({ "name": name, "email": email, "phone": phone, "organisation": organisation,
        "service": service, "budget": budget, "timeline": timeline, "brief": brief, "consent": consent }),
    )
}

fn store_inquiry(directory: &Path, mut record: Value, now: u64) -> io::Result<String> {
    let mut random = [0; 16];
    SystemRandom::new()
        .fill(&mut random)
        .map_err(|_| io::Error::other("Could not generate an inquiry ID"))?;
    let id = format!("mh_{}", random.map(|byte| format!("{byte:02x}")).join(""));
    record["id"] = json!(id);
    record["createdAt"] = json!(now);
    record["consentAt"] = json!(now);
    record["status"] = json!("new");
    record["schemaVersion"] = json!(1);
    let bytes = serde_json::to_vec(&record)?;
    let partial = directory.join(format!(".{id}.tmp"));
    let destination = directory.join(format!("{id}.json"));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .mode(0o600)
        .open(&partial)?;
    let result = (|| {
        file.write_all(&bytes)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        // Publish one complete file. A duplicate reference cannot overwrite an earlier brief.
        fs::hard_link(&partial, destination)?;
        fs::remove_file(&partial)?;
        File::open(directory)?.sync_all()
    })();
    if result.is_err() {
        let _ = fs::remove_file(partial);
    }
    result?;
    Ok(id)
}
