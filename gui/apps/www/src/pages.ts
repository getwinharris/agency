import { brandLockup, brandStylesheet, faviconLinks } from "./brand.ts";
import { landingFaq, landingHero, runModes } from "./landing.ts";
import { sessionWalkthrough } from "./walkthrough.ts";
import { signInUrl } from "./auth/pages.ts";

const website = "https://bapx.in";
const docs = "https://docs.bapx.in";
const mediaHub = "https://mediahub.bapx.in/";
const source = "https://github.com/getwinharris/agency";
const contact = "bapxmediahub@gmail.com";

const landingLinks = [
  ["Product", `${website}/#how-it-works`],
  ["Download", "/download/"],
  ["Pricing", "/pricing/"],
  ["Docs", `${docs}/`],
  ["Media Hub", mediaHub],
  ["Sign in", signInUrl],
];

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
  return brandLockup("brand", 120, surface === "Docs" ? "Docs" : undefined);
}

function landingMenu() {
  const links = landingLinks.map(([label, href]) => `<a href="${href}">${label}</a>`).join("");
  return `<nav class="landing-desktop-nav" aria-label="Main">${links}</nav>
  <details class="landing-mobile-menu" data-landing-menu>
    <summary>Menu</summary>
    <nav aria-label="Main">${links}</nav>
  </details>`;
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
  return `<!doctype html>
<html lang="en-IN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">${landing ? `
  <meta property="og:title" content="${title}">
  <meta property="og:site_name" content="bapX">
  <meta property="og:description" content="${description}">
  <meta name="twitter:title" content="${title}">` : ""}
  ${brandStylesheet}
  <meta name="theme-color" content="#0a090e">${landing ? `
  <link rel="stylesheet" href="/brand/landing-nav.css">
  <script src="/brand/landing-nav.js" defer></script>` : ""}
  <link rel="canonical" href="${canonical}">
  ${faviconLinks}
  <link rel="stylesheet" href="/site.css?v=${landing ? "agent-worktree-demo" : "violet-accent"}">${landing ? `
  <link rel="stylesheet" href="/brand/hero-worktrees.css?v=agent-worktrees">
  <link rel="stylesheet" href="/brand/agent-swap-motion.css?v=agent-worktrees">
  <link rel="stylesheet" href="/brand/disclosures-motion.css?v=agent-worktrees">` : ""}
${surface === "Docs" ? '  <link rel="stylesheet" href="/docs.css">\n' : ""}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="shell site-header${landing ? " landing-header" : ""}">
  ${brand(surface)}
  ${landing ? landingMenu() : `<nav aria-label="Main">
    <a href="${website}/#how-it-works">How it works</a>
    <a href="${docs}/"${surface === "Docs" ? ' aria-current="page"' : ""}>Docs</a>
    <a href="${mediaHub}">MediaHub</a>
    <a href="${source}">GitHub <span class="arrow" aria-hidden="true"></span></a>
    <a href="${signInUrl}">Sign in</a>
  </nav>`}
</header>
${body}
<footer class="shell site-footer">
  ${brand(surface)}
  <nav aria-label="Footer">
    <a href="${docs}/">Docs</a>
    <a href="${mediaHub}">MediaHub</a>
    <a href="${website}/download/">Download</a>
    <a href="${website}/pricing/">Pricing</a>
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
      title: "bapX",
      description: "Run Codex and other native coding agents locally or on your private Linux Core with bapX.",
      canonical: `${website}/`,
      landing: true,
      body: `<main id="main" class="shell landing-main">
  ${landingHero(docs)}
  ${sessionWalkthrough()}
  ${runModes(docs)}
  ${projectGuide()}
  ${landingFaq(docs)}
</main>
<script src="/brand/session-demo.js?v=agent-worktree-demo" defer></script>
<script src="/brand/project-paths.js" defer></script>`,
    }),
    "download/index.html": page({
      title: "Download bapX Agents",
      description: "Find bapX Agents installer availability for macOS, Windows, Linux, and Android.",
      canonical: `${website}/download/`,
      landing: true,
      body: `<link rel="stylesheet" href="/brand/downloads.css">
<main id="main" class="shell download-page" data-download-page>
    <header class="download-intro">
      <p class="download-kicker"><span aria-hidden="true"></span> bapX Agents / Download</p>
      <h1>Get the bapX app</h1>
      <p>Install the graphical app for your device. Downloads are pending release verification. You don’t need to build from source to use a released installer.</p>
    </header>
    <section aria-labelledby="downloads-heading">
      <div class="download-list-heading"><h2 id="downloads-heading">Choose your platform</h2>
        <p data-download-detection role="status" hidden></p>
      </div>
      <nav class="download-platform-links" aria-label="Platform shortcuts">
        <a href="#download-macos">macOS</a><a href="#download-windows">Windows</a><a href="#download-linux">Linux</a><a href="#download-android">Android</a>
      </nav>
      <div class="download-grid">

          <article class="download-card" id="download-macos" data-download-platform="macos" aria-labelledby="download-macos-heading">
            <div class="download-card-top"><span class="download-icon"><svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4m0 12v4M2 12h4m12 0h4M7 7l10 10M17 7 7 17"/></svg></span><span class="download-format">DMG</span></div>
            <h3 id="download-macos-heading">macOS</h3>
            <p class="download-target">Apple Silicon · macOS 13 or later</p>
            <p class="download-pending"><span aria-hidden="true"></span>Download pending</p>
            <p class="download-detail">A signed and notarized installer is not available yet.</p>
            <details><summary>How to install when available</summary><p>When available, open the DMG, drag bapX Agents to Applications, then open it from Applications.</p></details>
          </article>
          <article class="download-card" id="download-windows" data-download-platform="windows" aria-labelledby="download-windows-heading">
            <div class="download-card-top"><span class="download-icon"><svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5l8-1v7H3V5Zm10-1 8-1v8h-8V4ZM3 13h8v7l-8-1v-6Zm10 0h8v8l-8-1v-7Z"/></svg></span><span class="download-format">EXE</span></div>
            <h3 id="download-windows-heading">Windows</h3>
            <p class="download-target">x64 · per-user installer</p>
            <p class="download-pending"><span aria-hidden="true"></span>Download pending</p>
            <p class="download-detail">A verified installer is not available yet.</p>
            <details><summary>How to install when available</summary><p>When available, run the installer and launch bapX Agents from the Start menu.</p></details>
          </article>
          <article class="download-card" id="download-linux" data-download-platform="linux" aria-labelledby="download-linux-heading">
            <div class="download-card-top"><span class="download-icon"><svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v14H4zM7 9l3 3-3 3m6 0h4"/></svg></span><span class="download-format">AppImage</span></div>
            <h3 id="download-linux-heading">Linux</h3>
            <p class="download-target">x64 · glibc-based distributions</p>
            <p class="download-pending"><span aria-hidden="true"></span>Download pending</p>
            <p class="download-detail">A verified desktop package is not available yet.</p>
            <details><summary>How to install when available</summary><p>When available, use your file manager to allow the AppImage to run as a program, then open it.</p></details>
          </article>
          <article class="download-card" id="download-android" data-download-platform="android" aria-labelledby="download-android-heading">
            <div class="download-card-top"><span class="download-icon"><svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 6 5 3m12 3 2-3M4 17a8 8 0 0 1 16 0H4Zm5-4h.01m6 0h.01"/></svg></span><span class="download-format">APK</span></div>
            <h3 id="download-android-heading">Android</h3>
            <p class="download-target">Android app · cloud workspace access</p>
            <p class="download-pending"><span aria-hidden="true"></span>Download pending</p>
            <p class="download-detail">A verified APK is not available yet.</p>
            <details><summary>How to install when available</summary><p>When available, open the official APK and follow Android’s installation prompts. Open bapX Agents to sign in.</p></details>
          </article>
      </div>
    </section>
    <section class="download-next" aria-labelledby="download-next-heading">
      <div><h2 id="download-next-heading">Already have the app?</h2>
      <p>Open bapX Agents and sign in with your bapX account. New accounts require an invitation.</p></div>
      <div class="download-next-links"><a href="/account/">Your account</a><a href="https://docs.bapx.in/release-notes/#pending">Check release status</a></div>
    </section>
      <section class="download-next" aria-labelledby="download-pricing-heading">
      <div><h2 id="download-pricing-heading">Choose a bapX plan</h2><p>Run locally for free or see the minimum paid cloud plan.</p></div>
      <div class="download-next-links"><a href="/pricing/">See pricing</a></div>
    </section>
  </main>
<script type="module" src="/brand/downloads.js"></script>`,
    }),
    "pricing/index.html": page({
      title: "bapX pricing",
      description: "Free solo local use and storage-based pricing for bapX cloud.",
      canonical: `${website}/pricing/`,
      landing: true,
      body: `<link rel="stylesheet" href="/brand/downloads.css">
<main id="main" class="shell download-page">
  <header class="download-intro">
    <h1>bapX pricing</h1>
    <p>Use your own CLI agents and API credentials. Paid bapX plans are priced by storage, not agent hours.</p>
  </header>
  <section class="download-grid" aria-label="bapX plans">
    <article class="download-card">
      <h2>Free</h2>
      <p><strong>₹0</strong> · Solo, local only</p>
      <p>Run your own CLIs and use your own APIs on your device. No team workspace or bapX cloud services.</p>
    </article>
    <article class="download-card">
      <h2>Basic</h2>
      <p><strong>₹500/month</strong> · 5 GB</p>
      <p>The minimum paid plan for bapX cloud storage, agent sessions, automations, deployment, web hosting, and teams. No free cloud tier or trial.</p>
    </article>
  </section>
  <p>Third-party model providers may charge separately. Plan availability is confirmed in your bapX account.</p>
  <div class="download-next-links"><a href="/download/">Download bapX Agents</a><a href="/account/">Open your account</a></div>
</main>`,
    }),
    "privacy/index.html": page({
      title: "Privacy | bapX",
      description: "How bapX handles account information and MediaHub project briefs.",
      canonical: `${website}/privacy/`,
      body: `<main id="main" class="shell document">
  <h1>Privacy</h1>
  <section><h2>bapX accounts</h2><p>When you accept an invitation, we keep the invited email address and a password hash to operate your account. We use a secure browser cookie to keep you signed in. You can sign out from your account page.</p></section>
  <section><h2>MediaHub project briefs</h2><p>When you send a brief, we store the contact and project information you provide, your consent and limited source context such as campaign parameters, referrer and device category. We use it to review and respond to your engagement request. Your brief is only complete after the server validates and saves it.</p></section>
  <section><h2>Access and retention</h2><p>Only authorised bapX operators can access stored briefs. We keep them as long as needed to review or deliver the engagement and meet operational and legal obligations.</p></section>
  <section><h2>Your choices</h2><p>For access, correction or deletion requests, write to <a href="mailto:${contact}">${contact}</a>.</p></section>
</main>`,
    }),
  };
}
