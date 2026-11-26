const statuses = {
  new: "New",
  in_progress: "In progress",
  closed: "Closed",
};

const signupMethods = { email: "Email", google: "Google" };
const roles = { owner: "Owner", staff: "Staff", customer: "Customer" };
const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export function renderPage(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${styles}</style>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  ${body}
</body>
</html>`;
}

function csrfField(session) {
  return `<input type="hidden" name="_csrf" value="${escapeHtml(session.csrf)}">`;
}

function header(appName, session, admin = false) {
  const hasAdmin = session?.role === "owner" || session?.role === "staff";
  return `<header class="topbar">
    <a class="brand" href="/">${escapeHtml(appName)}</a>
    ${session ? `<nav class="account" aria-label="Account">
      <span class="identity">${escapeHtml(session.email)}</span>
      ${hasAdmin && !admin ? '<a href="/admin">Admin</a>' : ""}
      <form method="post" action="/auth/signout">
        ${csrfField(session)}<button type="submit">Sign out</button>
      </form>
    </nav>` : ""}
  </header>`;
}

function notice(message) {
  return message ? `<p class="notice" role="status">${escapeHtml(message)}</p>` : "";
}

function renderField(field) {
  const id = escapeHtml(field.id);
  const attributes = `name="${id}" id="field-${id}"${field.required ? " required" : ""}`;
  const control = field.type === "textarea"
    ? `<textarea ${attributes} rows="5" maxlength="4000"></textarea>`
    : `<input ${attributes} type="${field.type === "email" ? "email" : "text"}" maxlength="254">`;
  return `<label for="field-${id}">${escapeHtml(field.label)}${field.required ? " (required)" : ""}</label>${control}`;
}

function renderPublicForm(form, session) {
  if (!form) return '<p class="muted">There are no active forms.</p>';
  return `<section class="panel padded" aria-labelledby="form-title">
    <h2 id="form-title">${escapeHtml(form.title)}</h2>
    <form class="stack" method="post" action="/forms/${encodeURIComponent(form.id)}">
      ${csrfField(session)}
      <input type="hidden" name="_revision" value="${escapeHtml(form.revision)}">
      ${form.fields.map(renderField).join("\n")}
      <button class="primary" type="submit">Submit enquiry</button>
    </form>
  </section>`;
}

export function renderHome({ appName, session, form, message, googleEnabled }) {
  const content = session ? renderPublicForm(form, session) : `<section class="panel padded" aria-labelledby="signin-title">
    <h2 id="signin-title">Sign up or sign in</h2>
    <form class="stack" method="post" action="/auth/email">
      <label for="email">Email address</label>
      <input id="email" name="email" type="email" autocomplete="email" maxlength="254" required>
      <button class="primary" type="submit">Send sign-in link</button>
    </form>
    ${googleEnabled ? '<p class="actions"><a class="button" href="/auth/google">Continue with Google</a></p>' : ""}
  </section>`;
  return renderPage(appName, `${header(appName, session)}
    <main class="home" id="main" tabindex="-1">
      <h1>${escapeHtml(appName)}</h1>
      ${notice(message)}
      ${content}
    </main>`);
}

function option(value, label, current) {
  return `<option value="${escapeHtml(value)}"${current === value ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function statusOptions(current) {
  return Object.entries(statuses).map(([value, label]) => option(value, label, current)).join("");
}

function assigneeOptions(assignees, current) {
  return assignees.map((user) => option(user.id, user.email, current)).join("");
}

function dateTime(value) {
  const time = new Date(value);
  if (!value || !Number.isFinite(time.valueOf())) return "—";
  return `<time datetime="${time.toISOString()}">${escapeHtml(dateFormat.format(time))}</time>`;
}

function adminHref(filters, extra = {}) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries({
    q: filters.q,
    form: filters.form,
    status: filters.status,
    assignee: filters.assignee,
    ...extra,
  })) {
    if (value) params.set(name, value);
  }
  return params.size ? `/admin?${params}` : "/admin";
}

function renderForms(forms, filters) {
  return `<section class="panel padded" aria-labelledby="forms-title" id="forms">
    <h2 id="forms-title">Forms</h2>
    ${forms.length ? `<ul class="form-list">
      ${forms.map((form) => `<li>
        <a href="${escapeHtml(adminHref({}, { form: form.id }))}#submissions"${filters.form === form.id ? ' aria-current="true"' : ""}>${escapeHtml(form.title)}</a>
        <span class="muted">${form.archived ? "Archived" : `${form.fields.length} ${form.fields.length === 1 ? "field" : "fields"}`}</span>
      </li>`).join("\n")}
    </ul>` : '<p class="muted">No forms are configured.</p>'}
  </section>`;
}

function recordCell(label, content, rowHeader = false) {
  const tag = rowHeader ? "th" : "td";
  const attributes = rowHeader ? 'scope="row" role="rowheader"' : 'role="cell"';
  return `<${tag} ${attributes}><span class="record-label" aria-hidden="true">${escapeHtml(label)}</span>
    <div class="record-value">${content}</div></${tag}>`;
}

function submissionPreview(fields) {
  const contact = fields.find((field) => field.type === "email" && field.value);
  const brief = fields.find((field) => field.type === "textarea" && field.value);
  if (!contact && !brief) return "";
  const summary = brief && (brief.value.length > 160 ? `${brief.value.slice(0, 157)}…` : brief.value);
  return `<dl class="record-preview">
    ${contact ? `<dt>${escapeHtml(contact.label)}</dt><dd>${escapeHtml(contact.value)}</dd>` : ""}
    ${brief ? `<dt>${escapeHtml(brief.label)}</dt><dd>${escapeHtml(summary)}</dd>` : ""}
  </dl>`;
}

function renderInbox(forms, submissions, assignees, filters, selected) {
  const rows = submissions.map((submission) => {
    const leadHref = adminHref(filters, { submission: submission.id });
    const assignee = assignees.find((user) => user.id === submission.lead.assigneeId);
    const title = `<a href="${escapeHtml(leadHref)}#lead"${selected?.id === submission.id ? ' aria-current="true"' : ""}>${escapeHtml(submission.formTitle)}</a>`;
    return `<tr role="row"${selected?.id === submission.id ? ' class="selected"' : ""}>
      ${recordCell("Form", title + submissionPreview(submission.fields))}
      ${recordCell("Received (UTC)", dateTime(submission.createdAt))}
      ${recordCell("Status", `<span class="status">${escapeHtml(statuses[submission.lead.status])}</span>`)}
      ${recordCell("Assignee", escapeHtml(assignee?.email ?? "Unassigned"))}
      ${recordCell("Source", `<a href="${escapeHtml(leadHref)}#original-submission">Original submission</a>`)}
    </tr>`;
  }).join("\n");
  return `<section class="panel" aria-labelledby="inbox-title" id="submissions">
    <div class="panel-header">
      <h2 id="inbox-title">Submissions inbox</h2>
      <a class="button" href="${escapeHtml(adminHref(filters, { export: "csv" }))}">Export CSV</a>
    </div>
    <form class="filters" method="get" action="/admin#submissions" aria-label="Filter submissions">
      <label>Search<input type="search" name="q" value="${escapeHtml(filters.q)}" maxlength="300" placeholder="Search submitted values"></label>
      <label>Form<select name="form">${option("", "All forms", filters.form)}${forms.map((form) => option(form.id, form.title, filters.form)).join("")}</select></label>
      <label>Status<select name="status">${option("", "All statuses", filters.status)}${statusOptions(filters.status)}</select></label>
      <label>Assignee<select name="assignee">${option("", "Any assignee", filters.assignee)}${option("unassigned", "Unassigned", filters.assignee)}${assigneeOptions(assignees, filters.assignee)}</select></label>
      <button class="primary" type="submit">Apply filters</button>
      <a href="/admin#submissions">Clear</a>
    </form>
    ${rows ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Form submissions">
      <table class="record-table" role="table">
        <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Form</th><th scope="col" role="columnheader">Received (UTC)</th><th scope="col" role="columnheader">Status</th><th scope="col" role="columnheader">Assignee</th><th scope="col" role="columnheader">Source</th></tr></thead>
        <tbody role="rowgroup">${rows}</tbody>
      </table>
    </div>` : '<p class="muted padded">No submissions match these filters.</p>'}
  </section>`;
}

function renderSubmission(submission, session, assignees) {
  if (!submission) return `<section class="panel padded" aria-labelledby="lead-title">
    <h2 id="lead-title">Enquiry details</h2><p class="muted">Select a submission to review and assign it.</p>
  </section>`;

  const notes = submission.lead.notes.map((note) => `<li>
    <p>${escapeHtml(note.text)}</p>
    <p class="muted">${escapeHtml(note.author)} · ${dateTime(note.createdAt)} UTC</p>
  </li>`).join("\n");

  return `<section class="panel padded" id="lead" tabindex="-1" aria-labelledby="lead-title">
    <h2 id="lead-title">${escapeHtml(submission.formTitle)}</h2>
    <p><a href="#original-submission">View original submission</a></p>
    <form class="stack" method="post" action="/admin/submissions/${encodeURIComponent(submission.id)}">
      ${csrfField(session)}
      <label for="lead-assignee">Assignee</label>
      <select id="lead-assignee" name="assignee">${option("", "Unassigned", submission.lead.assigneeId ?? "")}${assigneeOptions(assignees, submission.lead.assigneeId)}</select>
      <label for="lead-status">Status</label>
      <select id="lead-status" name="status">${statusOptions(submission.lead.status)}</select>
      <label for="lead-note">Add internal note</label>
      <textarea id="lead-note" name="note" rows="3" maxlength="4000"></textarea>
      <button class="primary" type="submit">Save enquiry</button>
    </form>
    ${notes ? `<h3>Internal notes</h3><ol class="notes">${notes}</ol>` : ""}
    <section class="original" id="original-submission" tabindex="-1" aria-labelledby="original-title">
      <h3 id="original-title">Original submission</h3>
      <p class="muted">${dateTime(submission.createdAt)} UTC</p>
      <dl class="details">${submission.fields.map((field) => `<dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(field.value) || "—"}</dd>`).join("\n")}</dl>
    </section>
  </section>`;
}

function renderMetrics(metrics) {
  return `<section class="panel" aria-labelledby="activity-title" id="activity">
    <div class="panel-header"><h2 id="activity-title">Account activity</h2></div>
    ${metrics.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Account activity by date">
      <table>
        <caption>Sign-ups count once at verification. Sign-ins count successful returns.</caption>
        <colgroup></colgroup><colgroup span="2"></colgroup><colgroup></colgroup>
        <thead><tr><th scope="col" rowspan="2">Date (UTC)</th><th scope="colgroup" colspan="2">Verified sign-ups by original method</th><th scope="col" rowspan="2">Sign-ins</th></tr>
          <tr><th scope="col">Email</th><th scope="col">Google</th></tr></thead>
        <tbody>${metrics.map((day) => `<tr><th scope="row"><time datetime="${escapeHtml(day.day)}">${escapeHtml(day.day)}</time></th><td>${escapeHtml(day.email)}</td><td>${escapeHtml(day.google)}</td><td>${escapeHtml(day.signIns)}</td></tr>`).join("\n")}</tbody>
      </table>
    </div>` : '<p class="muted padded">No verified sign-ups or sign-ins yet.</p>'}
  </section>`;
}

function renderUsers(users, session) {
  return `<section class="panel" aria-labelledby="accounts-title" id="accounts">
    <div class="panel-header"><h2 id="accounts-title">App accounts</h2></div>
    ${users.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="App accounts">
      <table class="record-table" role="table">
        <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Email</th><th scope="col" role="columnheader">Original signup method</th><th scope="col" role="columnheader">Verified (UTC)</th><th scope="col" role="columnheader">Role</th></tr></thead>
        <tbody role="rowgroup">${users.map((user) => `<tr role="row">
          ${recordCell("Email", escapeHtml(user.email), true)}
          ${recordCell("Signup method", escapeHtml(signupMethods[user.signupMethod] ?? "—"))}
          ${recordCell("Verified (UTC)", dateTime(user.verifiedAt))}
          ${recordCell("Role", user.role === "owner" ? "Owner" : `<form class="role-form" method="post" action="/admin/roles/${encodeURIComponent(user.id)}">
            ${csrfField(session)}
            <select name="role" aria-label="Role for ${escapeHtml(user.email)}">${option("customer", roles.customer, user.role)}${option("staff", roles.staff, user.role)}</select>
            <button type="submit">Save role</button>
          </form>`)}
        </tr>`).join("\n")}</tbody>
      </table>
    </div>` : '<p class="muted padded">No accounts yet.</p>'}
  </section>`;
}

export function renderAdmin({ appName, session, forms, submissions, users, metrics, filters = {}, selected, message }) {
  const isOwner = session.role === "owner";
  const assignees = users.filter((user) => user.role === "owner" || user.role === "staff");
  return renderPage(`${appName} Admin`, `${header(appName, session, true)}
    <main class="workspace" id="main" tabindex="-1">
      <h1>Admin</h1>
      <nav class="section-nav" aria-label="Admin sections">
        <a href="#forms">Forms</a><a href="#submissions">Inbox</a>
        ${isOwner ? '<a href="#activity">Activity</a><a href="#accounts">Accounts</a>' : ""}
      </nav>
      ${notice(message)}
      ${renderForms(forms, filters)}
      <div class="inbox-grid">
        ${renderInbox(forms, submissions, assignees, filters, selected)}
        ${renderSubmission(selected, session, assignees)}
      </div>
      ${isOwner ? `${renderMetrics(metrics)}${renderUsers(users, session)}` : ""}
    </main>`);
}

const styles = `
  :root {
    color-scheme: dark;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
    color: #f3eff7;
    background: #100e13;
    --panel: #19151f;
    --raised: #221c28;
    --border: #463952;
    --accent: #c8a2ff;
    --muted: #c0b5c8;
    --primary: #bb8dfc;
    --primary-ink: #170b25;
    --radius: .65rem;
    --spacing: 1rem;
  }
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; line-height: 1.45; }
  a { color: var(--accent); text-underline-offset: .17em; }
  :focus-visible { outline: .125rem solid var(--accent); outline-offset: .18rem; }
  .skip { position: fixed; inset: -10rem auto auto 1rem; z-index: 1; background: var(--panel); padding: var(--spacing); }
  .skip:focus { inset-block-start: var(--spacing); }
  .topbar, .account, .section-nav, .panel-header, .actions, .role-form { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; }
  .topbar { justify-content: space-between; padding: .75rem clamp(1rem, 4vw, 2rem); border-block-end: .063rem solid var(--border); background: var(--panel); }
  .brand { color: inherit; text-decoration: none; font-size: 1.14rem; font-weight: 720; overflow-wrap: anywhere; }
  .identity, .muted { color: var(--muted); }
  .identity { font-size: .85rem; overflow-wrap: anywhere; }
  .workspace, .home { margin: auto; padding: clamp(1rem, 4vw, 2rem); }
  .workspace { max-width: 88rem; }
  .home { max-width: 42rem; }
  h1 { margin: 0 0 .9rem; font-size: clamp(1.95rem, 5vw, 3rem); line-height: 1.1; letter-spacing: -.045em; overflow-wrap: anywhere; }
  h2, h3 { margin-block-start: 0; line-height: 1.3; overflow-wrap: anywhere; }
  h2 { margin-block-end: .7rem; font-size: 1.08rem; }
  h3 { margin-block: var(--spacing) .5rem; font-size: .94rem; }
  p { margin-block: 0 .8rem; }
  .panel { min-width: 0; border: .063rem solid var(--border); border-radius: var(--radius); background: var(--panel); }
  .workspace > .panel, .workspace > .inbox-grid { margin-block: var(--spacing); }
  .panel-header { justify-content: space-between; border-block-end: .063rem solid var(--border); padding: .75rem var(--spacing); }
  .panel-header h2, .padded > :last-child { margin-bottom: 0; }
  .padded { padding: var(--spacing); }
  .inbox-grid { display: grid; align-items: start; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: var(--spacing); }
  .form-list, .notes { margin: 0; padding: 0; list-style: none; }
  .form-list { display: flex; flex-wrap: wrap; gap: .65rem; }
  .form-list li { display: flex; align-items: baseline; gap: .6rem; padding: .5rem .75rem; border: .063rem solid var(--border); border-radius: var(--radius); overflow-wrap: anywhere; }
  .form-list .muted { font-size: .82rem; }
  .notice { margin-block: var(--spacing); padding: .7rem .9rem; border-radius: var(--radius); border: .063rem solid var(--border); background: var(--raised); overflow-wrap: anywhere; }
  .filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; align-items: center; padding: var(--spacing); }
  label { display: grid; gap: .38rem; color: inherit; font-size: .88rem; font-weight: 650; }
  .stack { display: grid; gap: .45rem; margin-block: .85rem; }
  .stack label:not(:first-of-type) { margin-block-start: .4rem; }
  .stack button { justify-self: start; margin-block-start: .4rem; }
  input, select, textarea, button, .button { font: inherit; }
  input, select, textarea { width: 100%; min-inline-size: 0; padding: .55rem .65rem; border: .063rem solid var(--border); border-radius: .4rem; color: inherit; background: #141019; }
  input::placeholder { color: var(--muted); }
  textarea { resize: vertical; }
  button, .button { display: inline-flex; align-items: center; justify-content: center; min-block-size: 2.5rem; padding: .47rem .8rem; color: inherit; background: var(--raised); border: .063rem solid var(--border); border-radius: .42rem; text-decoration: none; font-size: .87rem; font-weight: 650; cursor: pointer; }
  button:hover, .button:hover { border-color: var(--accent); }
  .primary { border-color: var(--primary); background: var(--primary); color: var(--primary-ink); }
  .actions { margin-block-start: var(--spacing); }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: .87rem; }
  caption { padding: .75rem var(--spacing); color: var(--muted); text-align: start; }
  th, td { padding: .62rem .7rem; text-align: start; border-block-end: .063rem solid var(--border); }
  thead th { background: var(--raised); color: var(--muted); font-size: .79rem; }
  td, tbody th { overflow-wrap: anywhere; }
  tbody tr:last-child > * { border-block-end: 0; }
  time { white-space: nowrap; }
  .role-form { min-width: 13rem; }
  .role-form select { width: auto; }
  .selected { background: var(--raised); }
  .status { display: inline-block; white-space: nowrap; padding: .16rem .48rem; border: .063rem solid var(--border); border-radius: 2rem; }
  .original, .notes li + li { border-block-start: .063rem solid var(--border); }
  .notes li { padding: .65rem 0; }
  .notes li p:first-child, .details dd { white-space: pre-wrap; overflow-wrap: anywhere; }
  .notes li p:last-child { margin: 0; font-size: .8rem; }
  .details { margin: 0; }
  .details dt { font-size: .85rem; color: var(--muted); }
  .details dd { margin: .2rem 0 .7rem; }
  .record-label, .record-preview { display: none; }
  @media (max-width: 65rem) { .inbox-grid { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 37rem) {
    .record-table, .record-table tbody, .record-table tr { display: block; }
    .record-table thead { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); }
    .record-table tbody tr { padding: .7rem var(--spacing); border-block-end: .063rem solid var(--border); }
    .record-table tbody tr:last-child { border-block-end: 0; }
    .record-table tbody :is(td, th) {
      display: grid;
      grid-template-columns: 6rem minmax(0, 1fr);
      gap: .5rem;
      padding: .35rem 0;
      border: 0;
    }
    .record-table tbody tr > :first-child { display: block; font-weight: 650; }
    .record-table tbody tr > :first-child .record-label { display: none; }
    .record-table .record-label { display: block; color: var(--muted); }
    .record-table time { white-space: normal; }
    .record-preview { display: block; margin: .6rem 0 0; font-weight: 400; }
    .record-preview dt { font-size: .82rem; color: var(--muted); }
    .record-preview dd { margin: .15rem 0 .45rem; }
    .record-table .role-form { display: flex; flex-wrap: wrap; gap: .35rem; min-width: 0; }
    .record-table .role-form select { max-width: 100%; }
  }
  @media (max-width: 25rem) { .filters { grid-template-columns: minmax(0, 1fr); } }
`;
