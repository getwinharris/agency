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
let copyMode = "draft";
let copyOperation = null;
let copyConflict = false;
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
    const error = new Error(payload?.message || "Admin is temporarily unavailable.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function showLogin(message = "") {
  operator = null;
  sessionVersion++;
  records = null;
  selectedId = null;
  currentCopy = null;
  copyMode = "draft";
  copyOperation = null;
  copyConflict = false;
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
  notice("copy-notice", "");
  renderCopy();
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

function draftCopy() {
  return {
    headline: byId("headline").value.trim(),
    briefIntro: byId("brief-intro").value.trim(),
  };
}

function hasCopyChanges(draft) {
  return currentCopy && (draft.headline !== currentCopy.headline || draft.briefIntro !== currentCopy.briefIntro);
}

function renderCopy() {
  const draft = draftCopy();
  const changed = hasCopyChanges(draft);
  const busy = Boolean(copyOperation);
  const canEdit = currentCopy && !busy;
  const preview = copyMode === "published" ? currentCopy : draft;
  byId("headline").disabled = !canEdit;
  byId("brief-intro").disabled = !canEdit;
  byId("reload-copy").disabled = busy;
  byId("reset-copy").disabled = !canEdit || !changed || copyConflict;
  byId("publish").disabled = !canEdit || !changed || !draft.headline || !draft.briefIntro || copyConflict;
  byId("publish-copy").setAttribute("aria-busy", String(busy));

  for (const mode of ["draft", "published"]) {
    const button = byId(`copy-mode-${mode}`);
    button.disabled = !currentCopy;
    button.setAttribute("aria-pressed", String(copyMode === mode));
  }
  byId("preview-page").hidden = !currentCopy;
  byId("preview-empty").hidden = Boolean(currentCopy);
  byId("preview-headline").textContent = preview?.headline || "Headline is empty";
  byId("preview-intro").textContent = preview?.briefIntro || "Introduction is empty";

  const state = copyOperation || (copyConflict ? "conflict" : currentCopy ? (changed ? "draft" : "published") : "unavailable");
  const label = {
    loading: "Loading…",
    publishing: "Publishing…",
    conflict: "Refresh required",
    draft: "Unsaved changes",
    published: "Published",
    unavailable: "Copy unavailable",
  }[state];
  const status = byId("copy-state");
  status.dataset.state = state;
  if (status.textContent !== label) status.textContent = label;
}

function fillCopy(copy) {
  byId("headline").value = copy.headline;
  byId("brief-intro").value = copy.briefIntro;
}

async function loadCopy() {
  if (!operator || copyOperation) return;
  const version = sessionVersion;
  const previous = currentCopy;
  const draft = draftCopy();
  copyOperation = "loading";
  notice("copy-notice", "");
  renderCopy();
  try {
    const result = await request("mediahub");
    if (version !== sessionVersion) return;
    currentCopy = result;
    copyConflict = false;
    fillCopy({
      headline: previous && draft.headline !== previous.headline ? draft.headline : result.headline,
      briefIntro: previous && draft.briefIntro !== previous.briefIntro ? draft.briefIntro : result.briefIntro,
    });
    if (hasCopyChanges(draftCopy())) {
      notice("copy-notice", "Published copy refreshed. Your edits are still here.");
    }
  } catch (error) {
    if (version === sessionVersion) notice("copy-notice", error.message, true);
  } finally {
    if (version === sessionVersion) {
      copyOperation = null;
      renderCopy();
    }
  }
}

byId("nav-inbox").addEventListener("click", () => openView("inbox"));
byId("nav-copy").addEventListener("click", () => openView("copy"));
byId("reload-inbox").addEventListener("click", loadInbox);
byId("reload-copy").addEventListener("click", loadCopy);
byId("search").addEventListener("input", renderInbox);
byId("filter").addEventListener("change", renderInbox);
byId("publish-copy").addEventListener("input", () => {
  copyMode = "draft";
  renderCopy();
});
for (const mode of ["draft", "published"]) {
  byId(`copy-mode-${mode}`).addEventListener("click", () => {
    copyMode = mode;
    renderCopy();
  });
}
byId("reset-copy").addEventListener("click", () => {
  fillCopy(currentCopy);
  renderCopy();
  notice("copy-notice", "Edits reset to the published copy.");
  byId("headline").focus();
});

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
  const draft = draftCopy();
  if (!hasCopyChanges(draft) || !draft.headline || !draft.briefIntro || copyOperation || copyConflict) return;
  const version = sessionVersion;
  let returnFocus = "publish";
  copyOperation = "publishing";
  notice("copy-notice", "");
  renderCopy();
  try {
    const published = await request("mediahub", {
      updatedAt: currentCopy.updatedAt,
      ...draft,
    });
    if (version !== sessionVersion) return;
    currentCopy = published;
    fillCopy(published);
    copyMode = "published";
    returnFocus = "copy-mode-published";
    notice("copy-notice", "Published to mediahub.bapx.in.");
  } catch (error) {
    if (version === sessionVersion) {
      copyConflict = error.status === 409;
      if (copyConflict) returnFocus = "reload-copy";
      const message = copyConflict
        ? "Someone published a newer version. Refresh the published copy to compare it with your edits."
        : error.message;
      notice("copy-notice", message, true);
    }
  } finally {
    if (version === sessionVersion) {
      copyOperation = null;
      renderCopy();
      if (view === "copy" && document.activeElement === document.body) byId(returnFocus).focus();
    }
  }
});

request("session")
  .then(({ username }) => showWorkspace(username))
  .catch((error) => showLogin(error.message === "Sign in to continue." ? "" : error.message));
