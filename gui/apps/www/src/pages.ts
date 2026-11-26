const website = "https://bapx.in";
const docs = "https://docs.bapx.in";
const mediaHub = "https://mediahub.bapx.in/";
const source = "https://github.com/getwinharris/agency";
const contact = "bapxmediahub@gmail.com";

function brand(surface: "Agents" | "Docs") {
  const href = surface === "Docs" ? docs : website;
  return `<a class="brand" href="${href}/"><img src="/brand/mark.svg" alt="" width="40" height="40"><span>bapX</span><span class="brand-divider" aria-hidden="true">/</span><span class="brand-surface">${surface}</span></a>`;
}

function page({
  title, description, canonical, body, surface = "Agents", landing = false,
}: {
  title: string;
  description: string;
  canonical: string;
  body: string;
  surface?: "Agents" | "Docs";
  landing?: boolean;
}) {
  const howItWorks = landing ? "#how-it-works" : `${website}/#how-it-works`;
  return `<!doctype html>
<html lang="en-IN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="theme-color" content="#0a090e">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" href="/brand/favicon.svg?v=583e9a9d" type="image/svg+xml">
  <link rel="stylesheet" href="/site.css?v=agency">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="shell site-header">
  ${brand(surface)}
  <nav aria-label="Main">
    <a href="${howItWorks}">How it works</a>
    <a href="${docs}/"${surface === "Docs" ? ' aria-current="page"' : ""}>Docs</a>
    <a href="${mediaHub}">MediaHub</a>
    <a href="${source}">GitHub <span class="arrow" aria-hidden="true"></span></a>
  </nav>
</header>
${body}
<footer class="shell site-footer">
  ${brand(surface)}
  <nav aria-label="Footer">
    <a href="${docs}/">Docs</a>
    <a href="${mediaHub}">MediaHub</a>
    <a href="${website}/privacy/">Privacy</a>
    <a href="mailto:${contact}">Contact</a>
  </nav>
</footer>
</body>
</html>`;
}

export function publicPages() {
  return {
    "index.html": page({
      title: "bapX Agents | Native coding agents from Mac to Linux",
      description: "Run Codex and other native coding agents on your Mac or a private Linux Core with bapX Agents, an open-source Cloudroom fork.",
      canonical: `${website}/`,
      landing: true,
      body: `<main id="main" class="shell">
  <section class="hero" aria-labelledby="headline">
    <div class="hero-art" aria-hidden="true">
      <img src="/brand/agency-signal.webp" alt="" width="1404" height="936" fetchpriority="high">
    </div>
    <div class="hero-content">
      <h1 id="headline">Start on your Mac.<br> Keep going <em>remotely.</em></h1>
      <p>Run Codex and other native coding agents locally or on your private Linux Core. Keep your project in your existing Git workflow.</p>
      <div class="actions">
        <a class="button button-primary" href="${docs}/#mac">Build the Mac app <span class="arrow" aria-hidden="true"></span></a>
        <a class="button button-secondary" href="#how-it-works">See how it works <span class="arrow arrow-down" aria-hidden="true"></span></a>
      </div>
    </div>
  </section>
  <section id="how-it-works" class="workflow" aria-labelledby="workflow-heading">
    <h2 id="workflow-heading">One project. Two environments.</h2>
    <div class="session-demo" data-session-demo data-active-mode="local">
      <div class="mode-controls" role="group" aria-label="Choose where the agent runs" hidden>
        <button type="button" data-mode="local" aria-pressed="true">On your Mac</button>
        <button type="button" data-mode="remote" aria-pressed="false">Private Core</button>
      </div>
      <div class="session-diagram">
        <div class="session-node session-local">
          <div class="node-icon laptop-icon" aria-hidden="true"></div>
          <div><h3>macOS</h3><p>Your development workspace</p></div>
        </div>
        <div class="session-path" aria-hidden="true"><span></span></div>
        <div class="session-node session-remote">
          <div class="node-icon server-icon" aria-hidden="true"></div>
          <div><h3>Linux Core</h3><p>Private remote execution</p></div>
        </div>
      </div>
      <p class="mode-caption" aria-live="polite">Keep the coding agent, files, and worktree on your Mac for a local session.</p>
    </div>
  </section>
  <section class="features" aria-labelledby="features-heading">
    <h2 id="features-heading">Built for your workflow.</h2>
    <div class="feature-grid">
      <article><h3>Use your native agents.</h3><p>Run Codex and other supported agents in the macOS app on Apple Silicon.</p></article>
      <article><h3>Run Core on your server.</h3><p>Pair with your private Linux Core to pick up a remote session when you reconnect.</p></article>
      <article><h3>Keep your work in Git.</h3><p>Continue using your repositories, branches, and worktrees in either environment.</p></article>
    </div>
  </section>
</main>
<script src="/brand/session-demo.js?v=agency" defer></script>`,
    }),
    "docs/index.html": page({
      title: "Documentation | bapX Agents",
      description: "Build the bapX Agents Mac app from Agency and connect it to a private Linux Core.",
      canonical: `${docs}/`,
      surface: "Docs",
      body: `<main id="main" class="shell document">
  <h1>bapX Agents documentation</h1>
  <p>bapX Agents is a fork of Cloudroom. The Mac app runs native coding agents and can connect to a private Linux Core.</p>
  <section id="mac">
    <h2>Build the Mac app</h2>
    <p>Build from source on Apple Silicon with macOS 13 or later. The first signed bapX download will be announced in Agency releases.</p>
    <div class="actions">
      <a class="button button-primary" href="${source}/blob/main/gui/README.md">Build instructions <span class="arrow" aria-hidden="true"></span></a>
      <a class="button button-secondary" href="${source}/releases">Agency releases <span class="arrow" aria-hidden="true"></span></a>
    </div>
  </section>
  <section>
    <h2>Run a private Core</h2>
    <p>Build the Rust Core on a dedicated Ubuntu machine. Configure Codex with your own account, keep the Core private, and pair from the Mac app using the Core’s private HTTPS URL and token.</p>
    <p class="document-links"><a href="${source}/blob/main/core/docs/setup.md#1-install-tools-and-build">Core setup</a><a href="${source}/blob/main/core/docs/setup.md#connect-the-desktop-app">Pair the app</a></p>
  </section>
  <section>
    <h2>Source and licensing</h2>
    <p class="document-links"><a href="${source}">Agency source</a><a href="${source}/blob/main/LICENSE">Apache 2.0 license</a><a href="${source}/blob/main/NOTICE">Third-party notices</a></p>
  </section>
</main>`,
    }),
    "privacy/index.html": page({
      title: "Privacy | bapX",
      description: "How bapX handles information submitted in MediaHub project briefs.",
      canonical: `${website}/privacy/`,
      body: `<main id="main" class="shell document">
  <h1>Privacy</h1>
  <section><h2>MediaHub project briefs</h2><p>When you send a brief, we store the contact and project information you provide, your consent and limited source context such as campaign parameters, referrer and device category. We use it to review and respond to your engagement request. Your brief is only complete after the server validates and saves it.</p></section>
  <section><h2>Access and retention</h2><p>Only authorised bapX operators can access stored briefs. We keep them as long as needed to review or deliver the engagement and meet operational and legal obligations.</p></section>
  <section><h2>Your choices</h2><p>For access, correction or deletion requests, write to <a href="mailto:${contact}">${contact}</a>.</p></section>
</main>`,
    }),
  };
}
