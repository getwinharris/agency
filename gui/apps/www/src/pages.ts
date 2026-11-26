const website = "https://bapx.in";
const docs = "https://docs.bapx.in";
const mediaHub = "https://mediahub.bapx.in/";
const source = "https://github.com/getwinharris/agency";
const contact = "bapxmediahub@gmail.com";

const brand = `<a class="brand" href="${website}/"><img src="/brand/mark.svg" alt="" width="36" height="36"><span>bapX</span></a>`;

function page(title: string, description: string, canonical: string, body: string) {
  return `<!doctype html>
<html lang="en-IN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="theme-color" content="#151718">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/site.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="shell site-header">
  ${brand}
  <nav aria-label="Main"><a href="${docs}/">Documentation</a><a href="${mediaHub}">MediaHub</a><a href="${source}">GitHub</a></nav>
</header>
${body}
<footer class="shell site-footer">
  ${brand}
  <nav aria-label="Footer"><a href="${mediaHub}">MediaHub</a><a href="${website}/privacy/">Privacy</a><a href="mailto:${contact}">Contact</a></nav>
</footer>
</body>
</html>`;
}

export function publicPages() {
  return {
    "index.html": page(
      "bapX Agents | Coding agents from Mac to cloud",
      "Run Codex and other native coding agents on your Mac or a private Linux Core. An open-source Cloudroom fork from bapX.",
      `${website}/`,
      `<main id="main" class="shell">
  <section class="hero" aria-labelledby="headline">
    <div>
      <h1 id="headline">Coding agents,<br> from Mac to cloud.</h1>
      <p>Run Codex and other native coding agents on your Mac or a private Linux Core. Pick up the same session when you reconnect.</p>
      <div class="actions">
        <a class="button" href="${docs}/#mac">Get the app</a>
        <a class="source" href="${source}">View on GitHub</a>
      </div>
    </div>
    <section class="hero-visual" data-session-demo aria-label="Session walkthrough">
      <div class="mode-controls" role="group" aria-label="Where the agent runs" hidden>
        <button type="button" data-mode="local" aria-pressed="true">On your Mac</button>
        <button type="button" data-mode="remote" aria-pressed="false">Private Core</button>
      </div>
      <div class="mode-illustration">
        <img src="/brand/mac-to-cloud.webp" width="1440" height="720" alt="">
        <canvas width="680" height="250" aria-hidden="true"></canvas>
      </div>
      <p class="mode-caption" aria-live="polite">Your Mac runs the native coding agent.</p>
    </section>
  </section>
  <section class="features" aria-label="How it works">
    <div><h2>Work on your Mac</h2><p>Use native coding agents on macOS with Apple Silicon.</p></div>
    <div><h2>Connect your own Core</h2><p>Run the open-source Rust Core on your own Linux infrastructure for a private, persistent session.</p></div>
    <div><h2>Keep your work in Git</h2><p>Stay in your existing Git workflow and keep control of your code and history.</p></div>
  </section>
</main>
<script src="/brand/session-demo.js" defer></script>`,
    ),
    "docs/index.html": page(
      "Documentation | bapX Agents",
      "Build the bapX Agents Mac app from Agency and connect it to a private Linux Core.",
      `${docs}/`,
      `<main id="main" class="shell document">
  <h1>bapX Agents documentation</h1>
  <p>bapX Agents is a fork of Cloudroom. The Mac app runs native coding agents and can connect to a private Linux Core.</p>
  <section id="mac">
    <h2>Get the Mac app</h2>
    <p>Build from source on Apple Silicon with macOS 13 or later. The first signed bapX download will be announced in Agency releases.</p>
    <p><a href="${source}/blob/main/gui/README.md">Build from source</a> · <a href="${source}/releases">Agency releases</a></p>
  </section>
  <section>
    <h2>Run a private Core</h2>
    <p>Build the Rust Core on a dedicated Ubuntu machine. Configure Codex with your own account, keep the Core private, and pair from the Mac app using the Core’s private HTTPS URL and token.</p>
    <p><a href="${source}/blob/main/core/docs/setup.md#1-install-tools-and-build">Core setup</a> · <a href="${source}/blob/main/core/docs/setup.md#connect-the-desktop-app">Pair the app</a></p>
  </section>
  <section>
    <h2>Source and licensing</h2>
    <p><a href="${source}">Agency source</a> · <a href="${source}/blob/main/LICENSE">Apache 2.0 license</a> · <a href="${source}/blob/main/NOTICE">Third-party notices</a></p>
  </section>
</main>`,
    ),
    "privacy/index.html": page(
      "Privacy | bapX",
      "How bapX handles information submitted in MediaHub project briefs.",
      `${website}/privacy/`,
      `<main id="main" class="shell document">
  <h1>Privacy</h1>
  <section><h2>MediaHub project briefs</h2><p>When you send a brief, we store the contact and project information you provide, your consent and limited source context such as campaign parameters, referrer and device category. We use it to review and respond to your engagement request. Your brief is only complete after the server validates and saves it.</p></section>
  <section><h2>Access and retention</h2><p>Only authorised bapX operators can access stored briefs. We keep them as long as needed to review or deliver the engagement and meet operational and legal obligations.</p></section>
  <section><h2>Your choices</h2><p>For access, correction or deletion requests, write to <a href="mailto:${contact}">${contact}</a>.</p></section>
</main>`,
    ),
  };
}
