import { brandLockup, brandStylesheet, faviconLinks, wordmark } from "../brand.ts";

function operatorBar() {
  return `<div id="operator-bar" class="operator" hidden>
      <span class="operator-name" id="operator-name"></span>
      <button type="button" class="control" id="sign-out">Sign out</button>
    </div>`;
}

function legacyLogin() {
  return `<section class="login-card" id="login" aria-labelledby="login-title" hidden>
        <p class="eyebrow">bapX operator workspace</p>
        <h1 id="login-title">Sign in</h1>
        <form id="login-form" method="post" action="/api/admin/login">
          <label for="username">Username</label>
          <input id="username" name="username" autocomplete="username" required maxlength="64">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required maxlength="200">
          <button class="control primary" id="submit-login" type="submit">Sign in</button>
          <p class="notice" id="login-notice" role="status"></p>
        </form>
      </section>`;
}

export function adminWorkspace(embedded = false) {
  const section = embedded ? "div" : "main";
  return `<div id="admin-workspace"${embedded ? ' data-account-admin hidden' : ""}>
  ${embedded ? `<div class="topbar">${operatorBar()}</div>` : ""}
  <div class="shell">
    <aside id="side-menu" class="sidebar" aria-label="Admin navigation" hidden>
      <nav aria-label="Workspace">
        <h2>MediaHub</h2>
        <button type="button" class="nav-button" id="nav-inbox" aria-controls="inbox" aria-current="page">
          <span class="nav-icon icon-inbox" aria-hidden="true"></span><span>Inquiries</span>
        </button>
        <button type="button" class="nav-button" id="nav-copy" aria-controls="copy">
          <span class="nav-icon icon-page" aria-hidden="true"></span><span>Homepage</span>
        </button>
        <button type="button" class="nav-button" id="nav-invitations" aria-controls="invitations" hidden>
          <span class="nav-icon icon-page" aria-hidden="true"></span><span>Accounts &amp; invitations</span>
        </button>
        <a class="nav-external" href="https://mediahub.bapx.in/" target="_blank" rel="noopener noreferrer">Visit MediaHub <span class="external-arrow" aria-hidden="true"></span></a>
      </nav>
    </aside>
    <${section} class="admin-main" id="${embedded ? "management" : "main"}" tabindex="-1"${embedded ? ' role="region" aria-label="Admin"' : ""}>
      <p class="loading" id="initial-status" role="status">Checking your session…</p>
      ${embedded ? "" : legacyLogin()}
      <p class="notice global-notice" id="global-notice" role="status" hidden></p>
      <section id="inbox" class="workspace" aria-labelledby="inbox-title" hidden>
        <header class="page-heading">
          <div>
            <p class="eyebrow">MediaHub</p>
            <h1 id="inbox-title">Project inquiries</h1>
            <p class="page-summary">Review project briefs and track client follow-up.</p>
          </div>
          <button type="button" class="control" id="reload-inbox">Refresh</button>
        </header>
        <dl class="metrics" aria-label="Inquiry totals">
          <div><dt>All inquiries</dt><dd id="metric-total">—</dd></div>
          <div><dt><span class="status-dot new"></span>New</dt><dd id="metric-new">—</dd></div>
          <div><dt><span class="status-dot contacted"></span>Contacted</dt><dd id="metric-contacted">—</dd></div>
          <div><dt><span class="status-dot qualified"></span>Qualified</dt><dd id="metric-qualified">—</dd></div>
        </dl>
        <p class="notice" id="inbox-notice" role="status"></p>
        <div class="inbox-grid">
          <section class="panel" aria-labelledby="list-title">
            <div class="panel-header">
              <h2 id="list-title">Inbox</h2>
              <p id="list-count" aria-live="polite"></p>
            </div>
            <div class="filters">
              <label for="search">Search inquiries
                <input type="search" id="search" placeholder="Name, company, or service" maxlength="200">
              </label>
              <label for="filter">Status
                <select id="filter">
                  <option value="">All statuses</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
            </div>
            <div class="table-wrap">
              <table>
                <thead><tr><th scope="col">Client</th><th scope="col">Status</th><th scope="col">Received</th></tr></thead>
                <tbody id="inquiry-list"></tbody>
              </table>
            </div>
            <p class="empty" id="empty-list" hidden></p>
          </section>
          <section class="panel detail" id="inquiry-detail" aria-labelledby="detail-title">
            <div class="panel-header"><h2 id="detail-title" tabindex="-1">Brief details</h2></div>
            <p class="empty" id="empty-detail">Select an inquiry to read the brief and update its status.</p>
            <div class="detail-body" id="detail-body" hidden>
              <p id="detail-reference" class="reference"></p>
              <dl class="details" id="detail-fields"></dl>
              <h3>Client brief</h3>
              <p id="detail-brief" class="brief-text"></p>
              <form id="update-inquiry" method="post">
                <label for="update-status">Status</label>
                <select id="update-status" required>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="closed">Closed</option>
                </select>
                <label for="notes">Internal notes</label>
                <textarea id="notes" rows="4" maxlength="5000"></textarea>
                <div class="form-actions">
                  <button type="submit" class="control primary" id="save-inquiry">Save changes</button>
                  <p class="notice" id="detail-notice" role="status"></p>
                </div>
              </form>
            </div>
          </section>
        </div>
      </section>
      <section id="copy" class="workspace" aria-labelledby="copy-title" hidden>
        <header class="page-heading copy-heading">
          <div>
            <p class="eyebrow">MediaHub</p>
            <h1 id="copy-title">Homepage copy</h1>
            <p class="page-summary">Edit the headline and introduction to the project brief form.</p>
          </div>
          <button type="button" class="control" id="reload-copy">Refresh published copy</button>
        </header>
        <div class="copy-grid">
          <section class="panel copy-editor" aria-labelledby="copy-editor-title">
            <div class="panel-header">
              <h2 id="copy-editor-title">Edit copy</h2>
              <p id="copy-state" class="copy-state" role="status"></p>
            </div>
            <form id="publish-copy" method="post" action="/api/admin/mediahub">
              <label for="headline">Main headline</label>
              <input id="headline" name="headline" required maxlength="220" disabled>
              <label for="brief-intro">Project brief introduction</label>
              <textarea id="brief-intro" name="briefIntro" required maxlength="420" rows="4" disabled></textarea>
              <div class="form-actions copy-actions">
                <button type="submit" class="control primary" id="publish" disabled>Publish to MediaHub</button>
                <button type="button" class="control" id="reset-copy" disabled>Reset edits</button>
              </div>
              <p class="notice copy-notice" id="copy-notice" role="status"></p>
            </form>
          </section>
          <section class="panel copy-preview" aria-labelledby="copy-preview-title">
            <div class="panel-header preview-header">
              <h2 id="copy-preview-title">Homepage preview</h2>
              <div class="preview-modes" role="group" aria-label="Preview version">
                <button type="button" class="control" id="copy-mode-draft" aria-pressed="true" disabled>Draft</button>
                <button type="button" class="control" id="copy-mode-published" aria-pressed="false" disabled>Published</button>
              </div>
            </div>
            <p id="preview-empty" class="empty">The preview appears when the published copy loads.</p>
            <div id="preview-page" class="preview-page" hidden>
              <div class="preview-brand">
                <img src="${wordmark}" width="66" height="22" alt="bapX"> <strong>MediaHub</strong>
              </div>
              <div class="preview-hero">
                <h3 id="preview-headline" class="preview-headline"></h3>
              </div>
              <div class="preview-brief">
                <h3>Tell us what you need to move forward.</h3>
                <p id="preview-intro" class="preview-intro"></p>
              </div>
            </div>
          </section>
        </div>
      </section>
      <section id="invitations" class="workspace" aria-labelledby="invitations-title" hidden>
        <header class="page-heading">
          <div>
            <h1 id="invitations-title">Accounts &amp; invitations</h1>
            <p class="page-summary">Registered bapX member accounts and unexpired signup invitations. Counts exclude the operator account.</p>
          </div>
          <button type="button" class="control" id="reload-account-overview">Refresh counts</button>
        </header>
        <dl class="metrics" aria-label="Account totals">
          <div><dt>Registered members</dt><dd id="registered-member-count">—</dd></div>
          <div><dt>Pending invitations</dt><dd id="pending-invitation-count">—</dd></div>
        </dl>
        <p class="notice" id="account-overview-notice" role="status"></p>
        <form class="panel invite-form" id="invite-form" method="post" action="/api/auth/invitations">
          <label for="invite-email">Email address</label>
          <input id="invite-email" name="email" type="email" autocomplete="off" maxlength="254" required>
          <div class="form-actions">
            <button type="submit" class="control primary" id="create-invite">Create invitation</button>
          </div>
          <div id="invite-result" hidden>
            <label for="invite-link">Signup link</label>
            <input id="invite-link" type="text" autocomplete="off" readonly>
            <button class="control" id="copy-invite" type="button">Copy signup link</button>
          </div>
          <p class="notice" id="invite-notice" role="status"></p>
        </form>
      </section>
    </${section}>
  </div>
</div>`;
}

export function adminPages(): Record<string, string> {
  return {
    "admin/index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <title>bapX Admin</title>
  ${brandStylesheet}
  ${faviconLinks}
  <link rel="stylesheet" href="/admin/index.css">
  <script src="/admin/index.js" defer></script>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <header class="topbar">
    ${brandLockup("brand", 90, "Admin")}
    ${operatorBar()}
  </header>
  ${adminWorkspace()}
</body>
</html>`,
  };
}
