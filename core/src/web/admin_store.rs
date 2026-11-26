use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use std::{
    cmp::Reverse,
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    os::unix::fs::OpenOptionsExt,
    path::Path,
};

const MAX_RECORD_BYTES: u64 = 64 * 1024;
const HEADLINE: (&str, &str) = ("<!--agency-headline-->", "<!--/agency-headline-->");
const BRIEF_INTRO: (&str, &str) = ("<!--agency-brief-intro-->", "<!--/agency-brief-intro-->");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct InquiryUpdate {
    status: String,
    notes: String,
    updated_at: Value,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct HomepageCopy {
    headline: String,
    brief_intro: String,
    updated_at: Option<u64>,
}

fn valid_id(id: &str) -> bool {
    let Some(suffix) = id.strip_prefix("mh_") else {
        return false;
    };
    match suffix.len() {
        32 => suffix.bytes().all(|byte| byte.is_ascii_hexdigit()),
        36 => suffix.bytes().enumerate().all(|(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        }),
        _ => false,
    }
}

fn read_json<T: DeserializeOwned>(path: &Path) -> io::Result<T> {
    let metadata = path.symlink_metadata()?;
    if !metadata.is_file() || metadata.len() > MAX_RECORD_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Invalid Admin data file",
        ));
    }
    let mut bytes = Vec::new();
    File::open(path)?
        .take(MAX_RECORD_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_RECORD_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Admin data file is too large",
        ));
    }
    Ok(serde_json::from_slice(&bytes)?)
}

fn write_json(path: &Path, value: &impl Serialize) -> io::Result<()> {
    let directory = path
        .parent()
        .ok_or_else(|| io::Error::other("Admin data directory is missing"))?;
    let mut entropy = [0u8; 16];
    SystemRandom::new()
        .fill(&mut entropy)
        .map_err(|_| io::Error::other("Could not generate an Admin data file name"))?;
    let suffix = entropy.map(|byte| format!("{byte:02x}")).join("");
    let temporary = directory.join(format!(".admin-{suffix}.tmp"));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .mode(0o600)
        .open(&temporary)?;
    let result = (|| {
        serde_json::to_writer(&mut file, value)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        fs::rename(&temporary, path)?;
        File::open(directory)?.sync_all()
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

fn inquiry(path: &Path, id: &str) -> io::Result<Value> {
    let record: Value = read_json(path)?;
    if record.get("id").and_then(Value::as_str) != Some(id) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Inquiry ID does not match its filename",
        ));
    }
    Ok(record)
}

pub(super) fn inquiries(directory: &Path) -> io::Result<Vec<Value>> {
    let mut records = Vec::new();
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let filename = entry.file_name();
        let Some(id) = filename
            .to_str()
            .and_then(|name| name.strip_suffix(".json"))
            .filter(|id| valid_id(id))
        else {
            continue;
        };
        if entry.file_type()?.is_file() {
            records.push(inquiry(&entry.path(), id)?);
        }
    }
    // The UI normalizes epoch milliseconds and legacy ISO timestamps before sorting.
    records.sort_by_cached_key(|record| {
        Reverse((
            record["createdAt"].as_u64(),
            record["createdAt"].as_str().unwrap_or_default().to_owned(),
            record["id"].as_str().unwrap_or_default().to_owned(),
        ))
    });
    Ok(records)
}

fn invalid() -> io::Error {
    io::Error::from(io::ErrorKind::InvalidInput)
}

fn next_revision(value: &Value) -> u64 {
    let previous = value.as_u64().unwrap_or(0);
    crate::observability::now_ms().max(previous.saturating_add(1))
}

pub(super) fn update_inquiry(
    directory: &Path,
    id: &str,
    update: InquiryUpdate,
    username: &str,
) -> io::Result<Value> {
    if !valid_id(id) {
        return Err(io::Error::from(io::ErrorKind::NotFound));
    }
    if !matches!(
        update.status.as_str(),
        "new" | "contacted" | "qualified" | "closed"
    ) || update.notes.chars().count() > 5000
        || update
            .notes
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\t' | '\n' | '\r'))
    {
        return Err(invalid());
    }
    let path = directory.join(format!("{id}.json"));
    let mut record = inquiry(&path, id)?;
    if update.updated_at != record["updatedAt"] {
        return Err(io::Error::from(io::ErrorKind::AlreadyExists));
    }
    record["updatedAt"] = json!(next_revision(&record["updatedAt"]));
    record["updatedBy"] = json!(username);
    record["status"] = json!(update.status);
    record["notes"] = json!(update.notes.trim());
    write_json(&path, &record)?;
    Ok(record)
}

fn marker_text<'a>(html: &'a str, (start, end): (&str, &str)) -> Option<&'a str> {
    html.split_once(start)?
        .1
        .split_once(end)
        .map(|(text, _)| text)
}

fn default_copy(root: &Path) -> io::Result<HomepageCopy> {
    let file = root.join("mediahub/index.html").canonicalize()?;
    if !file.starts_with(root) || !file.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Invalid MediaHub homepage",
        ));
    }
    let html = fs::read_to_string(file)?;
    let field = |markers| {
        marker_text(&html, markers)
            .map(|text| {
                text.trim()
                    .replace("&lt;", "<")
                    .replace("&gt;", ">")
                    .replace("&quot;", "\"")
                    .replace("&#39;", "'")
                    .replace("&amp;", "&")
            })
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    "Missing MediaHub content marker",
                )
            })
    };
    Ok(HomepageCopy {
        headline: field(HEADLINE)?,
        brief_intro: field(BRIEF_INTRO)?,
        updated_at: None,
    })
}

fn validate_copy(copy: &mut HomepageCopy) -> io::Result<()> {
    for (field, max_chars) in [(&mut copy.headline, 220), (&mut copy.brief_intro, 420)] {
        let trimmed = field.trim();
        if trimmed.is_empty()
            || trimmed.chars().count() > max_chars
            || trimmed.chars().any(char::is_control)
        {
            return Err(invalid());
        }
        *field = trimmed.to_owned();
    }
    Ok(())
}

pub(super) fn homepage_copy(root: &Path, path: &Path) -> io::Result<HomepageCopy> {
    let defaults = default_copy(root)?;
    match read_json(path) {
        Ok(copy) => Ok(copy),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(defaults),
        Err(error) => Err(error),
    }
}

pub(super) fn publish_homepage(
    root: &Path,
    path: &Path,
    mut copy: HomepageCopy,
) -> io::Result<HomepageCopy> {
    validate_copy(&mut copy)?;
    let current = homepage_copy(root, path)?;
    if copy.updated_at != current.updated_at {
        return Err(io::Error::from(io::ErrorKind::AlreadyExists));
    }
    copy.updated_at = Some(next_revision(&json!(current.updated_at)));
    write_json(path, &copy)?;
    Ok(copy)
}

fn escaped(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn replace_text(html: &mut String, (start, end): (&str, &str), value: &str) {
    let Some(start_at) = html.find(start).map(|index| index + start.len()) else {
        return;
    };
    if let Some(end_at) = html[start_at..].find(end) {
        html.replace_range(start_at..start_at + end_at, &escaped(value));
    }
}

pub(super) fn render_mediahub_home(path: &Path, contents: Vec<u8>) -> Vec<u8> {
    let Ok(mut copy) = read_json::<HomepageCopy>(path) else {
        return contents;
    };
    if validate_copy(&mut copy).is_err() {
        return contents;
    }
    let mut html = match String::from_utf8(contents) {
        Ok(html) => html,
        Err(error) => return error.into_bytes(),
    };
    replace_text(&mut html, HEADLINE, &copy.headline);
    replace_text(&mut html, BRIEF_INTRO, &copy.brief_intro);
    html.into_bytes()
}
