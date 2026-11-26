import { mediahubClients, type MediaHubClient } from "./portfolio.ts";
import { faviconLinks, wordmark } from "../brand.ts";

const mediaHubUrl = "https://mediahub.bapx.in";
const businessEmail = "bapxmediahub@gmail.com";
const description = "Brand, content production, social media management, digital marketing, websites, commerce and custom systems scoped around your business.";

const services = [
  ["Brand strategy & identity", "Brand strategy and identity", "Positioning, identity systems, campaign language, and practical brand tools."],
  ["Content & production", "Content and production", "Posters, reels, editing, photography direction, motion, print, television, radio, and campaign production."],
  ["Social Media Management", "Social Media Management", "Channel strategy, content calendars, publishing, community workflows, and recurring creative production."],
  ["Digital Marketing", "Digital Marketing", "Audience strategy, Meta and search campaigns, landing journeys, lead operations, and measurement."],
  ["Websites & commerce", "Websites and commerce", "Campaign sites, booking, ecommerce, customer accounts, owner CMS, CRM, and operational integrations.", "websites"],
  ["AI, data & automation", "AI, data, and automation", "Custom applications, enterprise data, agents, workflow automation, CRM/ERP, and forward-deployed engineering.", "automation"],
] as const;

const budgets = ["Under ₹50,000", "₹50,000–₹1,50,000", "₹1,50,000–₹5,00,000", "Above ₹5,00,000", "Need help scoping"];
const timelines = ["As soon as possible", "Within 30 days", "This quarter", "Exploring options"];

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function navigation(isHome: boolean): string {
  const home = isHome ? "" : "/";
  const links = `<a href="${home}#work">Work</a><a href="${home}#services">Services</a><a href="${home}#approach">Approach</a>`;
  return `<header class="site-header">
    <nav class="container navigation" aria-label="Primary navigation">
      <a class="lockup" href="/" aria-label="bapX MediaHub home">
        <img src="${wordmark}" width="114" height="38" alt=""><strong>MediaHub</strong>
      </a>
      <div class="desktop-links">${links}</div>
      <a class="button button-primary nav-cta" href="${home}#brief">Start a project</a>
      <details class="mobile-links">
        <summary>Menu</summary>
        <div>${links}<a href="${home}#brief">Start a project</a><a href="https://bapx.in/">bapX Home</a></div>
      </details>
    </nav>
  </header>`;
}

function documentPage(title: string, summary: string, path: string, content: string, socialImage: string): string {
  const canonical = `${mediaHubUrl}${path}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(summary)}">
  <link rel="canonical" href="${canonical}">
  ${faviconLinks}
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(summary)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${mediaHubUrl}${socialImage}">
  <link rel="stylesheet" href="/mediahub/site.css?v=wordmark">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  ${navigation(path === "/")}
  <main id="main">${content}</main>
  <footer class="site-footer"><div class="container footer-content">
    <span>bapX MediaHub &copy; ${new Date().getFullYear()}</span>
    <div><a href="mailto:${businessEmail}">${businessEmail}</a><a href="https://bapx.in/privacy/">Privacy</a><a href="https://bapx.in/">bapX Home</a></div>
  </div></footer>
  <script type="module" src="/mediahub/brief.js?v=brief-paths"></script>
</body>
</html>`;
}

function options(values: readonly string[]): string {
  return values.map((value) => `<option>${escapeHtml(value)}</option>`).join("");
}

function field(name: string, label: string, control: string, optional = false, fullWidth = false): string {
  return `<div class="field${fullWidth ? " field-wide" : ""}">
    <label for="brief-${name}">${label} ${optional ? "<small>optional</small>" : '<span aria-hidden="true">*</span>'}</label>
    ${control}
    <p class="field-error" id="brief-${name}-error" data-field-error="${name}"></p>
  </div>`;
}

function inputField(name: string, label: string, attributes: string, optional = false): string {
  return field(name, label, `<input id="brief-${name}" name="${name}" aria-describedby="brief-${name}-error" ${attributes}${optional ? "" : " required"}>`, optional);
}

function selectField(name: string, label: string, prompt: string, choices: string, fullWidth = false): string {
  return field(name, label, `<select id="brief-${name}" name="${name}" aria-describedby="brief-${name}-error" required><option value="">${prompt}</option>${choices}</select>`, false, fullWidth);
}

function briefForm(): string {
  const serviceOptions = services.map(([title, value, , project]) => (
    `<option value="${escapeHtml(value)}"${project ? ` data-project="${project}"` : ""}>${escapeHtml(title)}</option>`
  )).join("");
  return `<section class="section brief-section" id="brief">
    <div class="container two-up">
      <div>
        <p class="label">Start a project</p>
        <h2>Tell us what you need to move forward.</h2>
        <p class="intro"><!--agency-brief-intro-->Your project brief is shared with the authorised MediaHub team so we can review it and respond.<!--/agency-brief-intro--></p>
        <p>General enquiries <a href="mailto:${businessEmail}">${businessEmail}</a></p>
      </div>
      <div>
        <noscript><p>Enable JavaScript to submit a project brief. For general enquiries, email <a href="mailto:${businessEmail}">${businessEmail}</a>.</p></noscript>
        <form id="mediahub-inquiry" class="brief-form" method="post" hidden>
          <input type="hidden" name="startedAt" value="">
          <div class="honeypot" aria-hidden="true"><label for="brief-website">Website</label><input id="brief-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
          ${inputField("name", "Name", 'autocomplete="name" maxlength="100"')}
          ${inputField("email", "Work email", 'type="email" autocomplete="email" maxlength="254"')}
          ${inputField("phone", "Phone", 'type="tel" autocomplete="tel" maxlength="24"', true)}
          ${inputField("organisation", "Organisation", 'autocomplete="organization" maxlength="120"')}
          ${selectField("service", "Service", "Choose a service", `${serviceOptions}<option>Forward-deployed engineering</option>`)}
          ${selectField("budget", "Budget range", "Choose a range", options(budgets))}
          ${selectField("timeline", "Timeline", "Choose a timeline", options(timelines), true)}
          ${field("brief", "Project brief", '<textarea id="brief-brief" name="brief" rows="5" minlength="30" maxlength="4000" aria-describedby="brief-brief-error" placeholder="Your audience, goals, channels, current setup, constraints, and what a useful outcome looks like." required></textarea>', false, true)}
          <div class="field-wide">
            <div class="brief-consent">
              <input id="brief-consent" name="consent" type="checkbox" required aria-describedby="brief-consent-error">
              <label for="brief-consent">I agree to the <a href="https://bapx.in/privacy/" target="_blank" rel="noopener noreferrer">Privacy Policy</a> and consent to bapX MediaHub using this information to respond to this project brief.</label>
            </div>
            <p class="field-error" id="brief-consent-error" data-field-error="consent"></p>
          </div>
          <div class="field-wide">
            <button class="button button-primary" type="submit">Submit project brief</button>
            <p id="brief-status" role="status" aria-live="polite"></p>
          </div>
        </form>
        <div class="brief-success" id="brief-success" hidden tabindex="-1">
          <h3>Project brief submitted.</h3>
          <p>Your reference is <strong></strong>. The MediaHub team will review your brief and respond using the details you provided.</p>
          <a href="#work">Review our client work</a>
        </div>
      </div>
    </div>
  </section>`;
}

function homePage(): string {
  const portfolio = mediahubClients.map((client) => `<a class="client-card" href="/clients/${client.slug}/">
    <span class="client-card-image"><img src="${escapeHtml(client.logo)}" alt="" loading="lazy"></span>
    <strong>${escapeHtml(client.name)}</strong><small>${escapeHtml(client.category)}</small>
  </a>`).join("");
  const serviceList = services.map(([title, value, copy]) => `<li><a href="#brief" data-service="${escapeHtml(value)}">
    <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></span><span aria-hidden="true">→</span>
  </a></li>`).join("");

  return documentPage("Creative, social, digital and custom systems | bapX MediaHub", description, "/", `
    <section class="hero">
      <img class="hero-art" src="/mediahub/mediahub-fold-hero.png" alt="" fetchpriority="high" width="1672" height="941">
      <div class="container hero-content">
        <h1><!--agency-headline-->We create brands, content, social campaigns, digital marketing, and the custom systems behind growth.<!--/agency-headline--></h1>
        <div class="actions"><a class="button button-primary" href="#brief">Start a project brief <span aria-hidden="true">→</span></a><a class="button" href="#work">See client work</a></div>
      </div>
    </section>
    <section class="section" id="work"><div class="container">
      <p class="label">Client work</p>
      <div class="work-heading"><h2>Work across health, wellness, education, events and commerce.</h2><p>Seven active client stories across the products and channels we’ve delivered and maintained.</p></div>
      <div class="portfolio" aria-label="Client case studies">${portfolio}</div>
    </div></section>
    <section class="section light" id="services"><div class="container two-up">
      <div><p class="label">Services</p><h2>A creative and technology studio for growth.</h2><p class="intro">Every engagement is scoped around the outcome, channels, production, systems, and operating effort it actually needs.</p></div>
      <ul class="service-list">${serviceList}</ul>
    </div></section>
    <section class="section" id="approach"><div class="container two-up">
      <div><p class="label">Approach</p><h2>Creative work and delivery stay connected.</h2></div>
      <ol class="approach-list">
        <li><h3>Find the real audience problem</h3><p>We clarify who needs to act, what they need to understand, and where the journey currently breaks.</p></li>
        <li><h3>Shape the right mix</h3><p>Brand, production, social, advertising, funnel, website, and systems work are combined only where the outcome needs them.</p></li>
        <li><h3>Make and operate</h3><p>We build the creative and technical work, then support the publishing, campaigns, and workflows in the agreed scope.</p></li>
      </ol>
    </div></section>
    ${briefForm()}`, "/mediahub/mediahub-fold-hero.png");
}

function youtubeVideoId(href: string): string | null {
  const url = new URL(href);
  let id: string | null = null;
  if (url.hostname === "youtu.be") id = url.pathname.split("/")[1];
  if (url.hostname === "www.youtube.com" || url.hostname === "youtube.com") {
    id = url.pathname.startsWith("/shorts/") ? url.pathname.split("/")[2] : url.searchParams.get("v");
  }
  return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
}

function socialSection(social: NonNullable<MediaHubClient["social"]>): string {
  const examples = social.examples.map((example) => `<a href="${escapeHtml(example.href)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(example.label)}</span><strong>${escapeHtml(example.title)}</strong><span aria-hidden="true">↗</span></a>`).join("");
  const videos = social.examples.flatMap((example) => {
    const videoId = youtubeVideoId(example.href);
    return videoId ? [`<figure><iframe src="https://www.youtube-nocookie.com/embed/${videoId}" title="${escapeHtml(example.title)}" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe><figcaption>${escapeHtml(example.title)}</figcaption></figure>`] : [];
  });
  return `<section class="section social-section"><div class="container">
    <div class="work-heading"><h2>Social work connected to the customer journey.</h2><p>${escapeHtml(social.narrative)}</p></div>
    <div class="social-links">${examples}</div>
    ${videos.length ? `<div class="social-videos">${videos.join("")}</div>` : ""}
  </div></section>`;
}

function clientPage(client: MediaHubClient): string {
  const links = client.links.map((link) => `<a class="button" href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)} <span aria-hidden="true">↗</span></a>`).join("");
  const delivered = client.shipped.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  return documentPage(`${client.name} client work | bapX MediaHub`, client.summary, `/clients/${client.slug}/`, `
    <section class="section case-hero"><div class="container two-up">
      <div class="case-logo"><img src="${escapeHtml(client.logo)}" alt="${escapeHtml(client.logoAlt)}" fetchpriority="high"></div>
      <div><p class="label">${escapeHtml(client.category)}</p><h1>${escapeHtml(client.name)}</h1><p class="intro">${escapeHtml(client.summary)}</p><div class="actions">${links}</div></div>
    </div></section>
    <section class="section light case-story"><div class="container">
      <div class="two-up story-intro"><h2>${escapeHtml(client.narrative)}</h2><div><h3>Customer context</h3><p>${escapeHtml(client.challenge)}</p></div></div>
      <div class="two-up case-delivery"><div><h3>Delivered and maintained</h3><ul>${delivered}</ul></div><div><h3>How we maintain it</h3><p>${escapeHtml(client.operating)}</p></div></div>
    </div></section>
    ${client.social ? socialSection(client.social) : ""}
    <section class="section case-footer"><div class="container">
      <div class="actions"><a class="button button-primary" href="/#brief">Start a project brief</a><a class="button" href="/#work">All client work</a></div>
    </div></section>`, client.logo);
}

export function mediaHubPages(): Record<string, string> {
  return Object.fromEntries([
    ["mediahub/index.html", homePage()],
    ...mediahubClients.map((client) => [`mediahub/clients/${client.slug}/index.html`, clientPage(client)]),
  ]);
}
