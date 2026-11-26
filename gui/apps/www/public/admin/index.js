const byId = (id) => document.getElementById(id);
const statuses = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  closed: "Closed",
};
const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
const timestamp = (value) => value ? new Date(value).getTime() : 0;
const formatDate = (value) => {
  const date = timestamp(value);
  return Number.isFinite(date) && date > 0 ? dateFormatter.format(date) : "—";
};
let operator = null;
let view = "inbox";
let records = null;
let selectedId = null;
let currentCopy = null;
let sessionVersion = 0;

function notice(id, message, error = false) {
  const element = byId(id);
  element.textContent = message;
  element.classList.toggle("error", error);
}

async function request(path, data) {
  const opts = { cache: "no-store", credentials: "same-origin" };
  if (data !== undefined) {
    opts.method = "POST";
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(data);
  }
  let response;
  try {
    response = await fetch(`/api/admin/${path}`, opts);
  } catch {
    throw new Error("Could not reach Admin. Try again.");
  }
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && operator) {
      showLogin("Your session expired. Sign in again.");
    }
    throw new Error(payload?.message || "Admin is temporarily unavailable.");
  }
  return payload;
}

function showLogin(message = "") {
  operator = null;
  sessionVersion++;
  records = null;
  selectedId = null;
  currentCopy = null;
  byId("inbox").hidden = true;
  byId("copy").hidden = true;
  byId("side-menu").hidden = true;
  byId("operator-bar").hidden = true;
  byId("operator-name").textContent = "";
  byId("initial-status").hidden = true;
  byId("global-notice").hidden = true;
  byId("inquiry-list").replaceChildren();
  byId("detail-fields").replaceChildren();
  byId("update-inquiry").reset();
  byId("search").value = "";
  byId("filter").value = "";
  byId("detail-reference").textContent = "";
  byId("detail-brief").textContent = "";
  byId("publish-copy").reset();
  byId("password").value = "";
  previewCopy();
  byId("login").hidden = false;
  notice("login-notice", message, Boolean(message));
}

function showWorkspace(username) {
  operator = username;
  sessionVersion++;
  byId("initial-status").hidden = true;
  byId("login").hidden = true;
  byId("side-menu").hidden = false;
  byId("operator-bar").hidden = false;
  byId("operator-name").textContent = username;
  notice("detail-notice", "");
  void openView("inbox");
}

function openView(next) {
  view = next;
  if (!operator) return;
  byId("inbox").hidden = view !== "inbox";
  byId("copy").hidden = view !== "copy";
  for (const name of ["inbox", "copy"]) {
    const button = byId(`nav-${name}`);
    if (view === name) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  if (view === "inbox") {
    renderInbox();
    renderDetail();
    if (!records) void loadInbox();
  } else if (!currentCopy) {
    void loadCopy();
  }
}

function renderInbox() {
  const counts = records && {
    total: records.length,
    new: records.filter((record) => record.status === "new").length,
    contacted: records.filter((record) => record.status === "contacted").length,
    qualified: records.filter((record) => record.status === "qualified").length,
  };
  for (const name of ["total", "new", "contacted", "qualified"]) {
    byId(`metric-${name}`).textContent = counts?.[name] ?? "—";
  }
  const text = byId("search").value.trim().toLowerCase();
  const status = byId("filter").value;
  const visible = records?.filter((record) => {
    const fields = [record.name, record.organisation, record.service, record.email];
    return (!status || record.status === status) &&
      (!text || fields.some((field) => typeof field === "string" && field.toLowerCase().includes(text)));
  }) || [];
  const rows = document.createDocumentFragment();
  for (const record of visible) rows.append(inquiryRow(record));
  byId("inquiry-list").replaceChildren(rows);
  byId("list-count").textContent = records ? `${visible.length} shown` : "";
  const empty = byId("empty-list");
  empty.hidden = visible.length > 0;
  empty.textContent = records
    ? records.length ? "No inquiries match these filters." : "No project briefs have arrived."
    : "";
  empty.hidden ||= !empty.textContent;
}

function inquiryRow(record) {
  const row = document.createElement("tr");
  row.classList.toggle("selected", record.id === selectedId);
  const clientCell = row.insertCell();
  const client = document.createElement("button");
  client.type = "button";
  client.className = "client";
  client.textContent = record.name || record.organisation || "Project brief";
  client.setAttribute("aria-controls", "inquiry-detail");
  client.setAttribute("aria-pressed", String(record.id === selectedId));
  client.addEventListener("click", () => {
    selectedId = record.id;
    notice("detail-notice", "");
    renderInbox();
    renderDetail();
    byId("detail-title").focus();
  });
  clientCell.append(client);
  if (record.organisation) {
    const company = document.createElement("span");
    company.className = "company";
    company.textContent = record.organisation;
    clientCell.append(company);
  }
  const badge = document.createElement("span");
  const dot = document.createElement("span");
  const state = Object.hasOwn(statuses, record.status) ? record.status : "unknown";
  badge.className = "badge";
  dot.className = `status-dot ${state}`;
  badge.append(dot, statuses[state] || "Unknown");
  row.insertCell().append(badge);
  const received = document.createElement("time");
  received.textContent = formatDate(record.createdAt);
  const date = timestamp(record.createdAt);
  if (Number.isFinite(date) && date > 0) received.dateTime = new Date(date).toISOString();
  row.insertCell().append(received);
  return row;
}

function selected() {
  return records?.find((record) => record.id === selectedId);
}

function renderDetail() {
  const record = selected();
  byId("empty-detail").hidden = Boolean(record);
  byId("detail-body").hidden = !record;
  if (!record) return;
  byId("detail-reference").textContent = record.id;
  byId("detail-brief").textContent = record.brief;
  byId("update-status").value = Object.hasOwn(statuses, record.status) ? record.status : "";
  byId("notes").value = record.notes || "";
  const fields = byId("detail-fields");
  fields.replaceChildren();
  for (const [label, value] of [
    ["Contact", record.name],
    ["Organisation", record.organisation],
    ["Email", record.email],
    ["Phone", record.phone],
    ["Service", record.service],
    ["Budget", record.budget],
    ["Timeline", record.timeline],
    ["Received", formatDate(record.createdAt)],
  ]) {
    if (!value) continue;
    const cell = document.createElement("div");
    const term = document.createElement("dt");
    const details = document.createElement("dd");
    term.textContent = label;
    details.textContent = value;
    if (label === "Email" && /^[^\s@]+@[^\s@]+$/.test(value)) {
      const email = document.createElement("a");
      email.href = `mailto:${encodeURIComponent(value).replace("%40", "@")}`;
      email.textContent = value;
      details.replaceChildren(email);
    }
    cell.append(term, details);
    fields.append(cell);
  }
}

async function loadInbox() {
  const version = sessionVersion;
  const button = byId("reload-inbox");
  button.disabled = true;
  notice("inbox-notice", "Loading inquiries…");
  try {
    const result = await request("inquiries");
    if (version !== sessionVersion) return;
    records = result.sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));
    if (!selected()) selectedId = null;
    renderInbox();
    renderDetail();
    notice("inbox-notice", "");
    notice("detail-notice", "");
  } catch (error) {
    if (version === sessionVersion) notice("inbox-notice", error.message, true);
  } finally {
    button.disabled = false;
  }
}

function previewCopy() {
  byId("preview-headline").textContent = byId("headline").value;
  byId("preview-intro").textContent = byId("brief-intro").value;
}

function fillCopy(copy) {
  byId("headline").value = copy.headline;
  byId("brief-intro").value = copy.briefIntro;
  previewCopy();
}

async function loadCopy() {
  const version = sessionVersion;
  const button = byId("reload-copy");
  button.disabled = true;
  byId("publish").disabled = true;
  notice("copy-notice", "Loading homepage copy…");
  try {
    const result = await request("mediahub");
    if (version !== sessionVersion) return;
    currentCopy = result;
    fillCopy(currentCopy);
    notice("copy-notice", "");
  } catch (error) {
    if (version === sessionVersion) notice("copy-notice", error.message, true);
  } finally {
    button.disabled = false;
    byId("publish").disabled = !currentCopy;
  }
}

byId("nav-inbox").addEventListener("click", () => openView("inbox"));
byId("nav-copy").addEventListener("click", () => openView("copy"));
byId("reload-inbox").addEventListener("click", loadInbox);
byId("reload-copy").addEventListener("click", loadCopy);
byId("search").addEventListener("input", renderInbox);
byId("filter").addEventListener("change", renderInbox);
byId("publish-copy").addEventListener("input", previewCopy);

byId("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = byId("submit-login");
  button.disabled = true;
  notice("login-notice", "");
  try {
    const { username } = await request("login", {
      username: byId("username").value.trim(),
      password: byId("password").value,
    });
    byId("login-form").reset();
    showWorkspace(username);
  } catch (error) {
    notice("login-notice", error.message, true);
  } finally {
    byId("password").value = "";
    button.disabled = false;
  }
});

byId("sign-out").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  const message = byId("global-notice");
  message.hidden = true;
  try {
    await request("logout", {});
    showLogin();
    byId("username").focus();
  } catch (error) {
    message.hidden = false;
    notice("global-notice", error.message, true);
  } finally {
    button.disabled = false;
  }
});

byId("update-inquiry").addEventListener("submit", async (event) => {
  event.preventDefault();
  const record = selected();
  if (!record) return;
  const version = sessionVersion;
  const button = byId("save-inquiry");
  button.disabled = true;
  notice("detail-notice", "");
  try {
    const updated = await request(`inquiries/${encodeURIComponent(record.id)}`, {
      updatedAt: record.updatedAt ?? null,
      status: byId("update-status").value,
      notes: byId("notes").value,
    });
    if (version !== sessionVersion) return;
    records = records.map((item) => item.id === updated.id ? updated : item);
    renderInbox();
    if (selectedId === record.id) {
      renderDetail();
      notice("detail-notice", "Changes saved.");
    }
  } catch (error) {
    if (version === sessionVersion && selectedId === record.id) {
      notice("detail-notice", error.message, true);
    }
  } finally {
    button.disabled = false;
  }
});

byId("publish-copy").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentCopy) return;
  const version = sessionVersion;
  const button = byId("publish");
  button.disabled = true;
  notice("copy-notice", "");
  try {
    const published = await request("mediahub", {
      updatedAt: currentCopy.updatedAt,
      headline: byId("headline").value,
      briefIntro: byId("brief-intro").value,
    });
    if (version !== sessionVersion) return;
    currentCopy = published;
    fillCopy(currentCopy);
    notice("copy-notice", "Published to mediahub.bapx.in.");
  } catch (error) {
    if (version === sessionVersion) notice("copy-notice", error.message, true);
  } finally {
    button.disabled = !currentCopy;
  }
});

request("session")
  .then(({ username }) => showWorkspace(username))
  .catch((error) => showLogin(error.message === "Sign in to continue." ? "" : error.message));
