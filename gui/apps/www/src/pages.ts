import { faviconLinks, wordmark } from "./brand.ts";

const website = "https://bapx.in";
const docs = "https://docs.bapx.in";
const mediaHub = "https://mediahub.bapx.in/";
const source = "https://github.com/getwinharris/agency";
const contact = "bapxmediahub@gmail.com";

const projectPaths = [
  {
    id: "coding",
    label: "Run a coding agent",
    title: "Work in your repository",
    description: "Connect the desktop app to a private Linux Core. Run Codex on that machine and reopen the remote session when you reconnect.",
    action: "Set up a private Core",
    href: `${docs}/#private-core`,
  },
  {
    id: "websites",
    label: "Build a website",
    title: "Scope a website with MediaHub",
    description: "Tell us what the site needs to do, who it serves, and whether you need booking, commerce, or an editor.",
    action: "Start a website brief",
    href: `${mediaHub}?service=websites#brief`,
  },
  {
    id: "automation",
    label: "Automate a workflow",
    title: "Show us the task you repeat",
    description: "Share what starts the workflow, which tools it uses, and where a person needs to review the result.",
    action: "Start an automation brief",
    href: `${mediaHub}?service=automation#brief`,
  },
];

function projectGuide() {
  const choices = projectPaths.map(({ id, label }, index) => (
    `<button type="button" data-project-path="${id}" aria-controls="path-${id}" aria-pressed="${index === 0}">${label}</button>`
  )).join("");
  const panels = projectPaths.map(({ id, label, title, description, action, href }) => (
    `<article class="project-panel" id="path-${id}" data-project-panel="${id}">
      <h3><span class="project-panel-label">${label}</span>${title}</h3>
      <p>${description}</p>
      <a class="button button-secondary" href="${href}">${action} <span class="arrow" aria-hidden="true"></span></a>
    </article>`
  )).join("");

  return `<section class="project-guide" id="start" aria-labelledby="project-heading" data-project-guide>
    <h2 id="project-heading">Choose a starting point.</h2>
    <div class="project-layout">
      <div class="project-choices" role="group" aria-label="Project type" hidden>${choices}</div>
      <div class="project-panels">${panels}</div>
    </div>
  </section>`;
}

function brand(surface: "Agents" | "Docs") {
  const href = surface === "Docs" ? docs : website;
  return `<a class="brand" href="${href}/" aria-label="bapX ${surface} home"><img src="${wordmark}" alt="" width="120" height="40"><span class="brand-divider" aria-hidden="true">/</span><span class="brand-surface">${surface}</span></a>`;
}

export function page({
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
  ${faviconLinks}
  <link rel="stylesheet" href="/site.css?v=violet-accent">
${surface === "Docs" ? '  <link rel="stylesheet" href="/docs.css">\n' : ""}</head>
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
  ${projectGuide()}
</main>
<script src="/brand/session-demo.js?v=agency" defer></script>
<script src="/brand/project-paths.js" defer></script>`,
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
