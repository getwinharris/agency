import { brandLockup, brandStylesheet, faviconLinks } from "./brand.ts";
import { landingFaq, landingHero, runModes } from "./landing.ts";
import { sessionWalkthrough } from "./walkthrough.ts";

const website = "https://bapx.in";
const docs = "https://docs.bapx.in";
const mediaHub = "https://mediahub.bapx.in/";
const source = "https://github.com/getwinharris/agency";
const contact = "bapxmediahub@gmail.com";

const landingLinks = [
  ["Product", "#how-it-works"],
  ["Docs", `${docs}/`],
  ["Media Hub", mediaHub],
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
  <link rel="stylesheet" href="/site.css?v=${landing ? "agent-worktree-demo" : "violet-accent"}">
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
  </nav>`}
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
