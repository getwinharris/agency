import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { page } from "../pages.ts";
import { escapeHtml, renderMarkdown, repositoryLink } from "./markdown.ts";

const origin = "https://docs.bapx.in";
const repository = "https://github.com/getwinharris/agency";
const guides = [
  { slug: "build-from-source", label: "Build from source", source: "gui/README.md" },
  { slug: "desktop-packaging", label: "Desktop packaging", source: "gui/apps/desktop/README.md" },
  { slug: "private-core", label: "Private Core", source: "core/docs/setup.md" },
  { slug: "project-skills", label: "Project skills", source: "gui/docs/configuration.md", section: "Install an Agency skill in native agents" },
  { slug: "release-notes", label: "Changelog", source: "gui/docs/release-notes.md" },
];

function layout(body: string, current: string) {
  const links = [{ slug: "", label: "Overview" }, ...guides].map(({ slug, label }) => (
    `<li><a href="${slug ? `/${slug}/` : "/"}"${slug === current ? ' aria-current="page"' : ""}>${label}</a></li>`
  )).join("");
  return `<div class="shell docs-layout">
  <nav class="docs-nav" aria-label="Documentation"><ul>${links}</ul></nav>
  <main id="main" tabindex="-1" class="document docs-content">${body}</main>
</div>`;
}

function home() {
  return page({
    title: "Documentation | bapX Agents",
    description: "Build bapX Agents on macOS, Windows, or Linux and connect it to a private Linux Core.",
    canonical: `${origin}/`,
    surface: "Docs",
    body: layout(`
  <h1>bapX Agents documentation</h1>
  <p>bapX Agents is a fork of Cloudroom. The desktop app runs native coding agents and can connect to a private Linux Core.</p>
  <p>See the <a href="/release-notes/">release changelog</a> for verified web releases and desktop download availability.</p>
  <section id="mac">
    <h2>Build the Mac app</h2>
    <p>Build from source on Apple Silicon with macOS 13 or later. The first signed bapX download will be announced in Agency releases.</p>
    <div class="actions">
      <a class="button button-primary" href="/build-from-source/">Build instructions <span class="arrow" aria-hidden="true"></span></a>
      <a class="button button-secondary" href="${repository}/releases">Agency releases <span class="arrow" aria-hidden="true"></span></a>
    </div>
  </section>
  <section id="windows-linux">
    <h2>Build for Windows or Linux</h2>
    <p>Use the Windows x64 instructions to build a per-user installer, or the Linux x64 instructions to build an AppImage.</p>
    <p class="document-links"><a href="/desktop-packaging/#windows-nsis-x64">Windows installer build</a><a href="/desktop-packaging/#linux-appimage-x64">Linux AppImage build</a></p>
  </section>
  <section id="private-core">
    <h2>Run a private Core</h2>
    <p>Build the Rust Core on a dedicated Ubuntu machine. Configure Codex with your own account and pair from the desktop app using the Core’s private HTTPS URL and token.</p>
    <p class="document-links"><a href="/private-core/#1-install-tools-and-build">Core setup</a><a href="/private-core/#connect-the-desktop-app">Pair the app</a></p>
  </section>
  <section id="portable-skills">
    <h2>Install project skills</h2>
    <p>Install Agency’s file-tree skill in your project. Codex and OpenCode discover it there, and Hermes can load it through its profile.</p>
    <p class="document-links"><a href="/project-skills/#install-an-agency-skill-in-native-agents">Install and verify the skill</a></p>
  </section>
  <section>
    <h2>Source and licensing</h2>
    <p class="document-links"><a href="${repository}">Agency source</a><a href="${repository}/blob/main/LICENSE">Apache 2.0 license</a><a href="${repository}/blob/main/NOTICE">Third-party notices</a></p>
  </section>
`, ""),
  });
}

function excerpt(markdown: string, title: string) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.indexOf(`### ${title}`);
  if (start === -1) throw new Error(`Missing documentation section: ${title}`);
  const end = lines.findIndex((line, index) => index > start && /^#{1,3} /.test(line));
  return `# ${title}\n${lines.slice(start + 1, end === -1 ? lines.length : end).join("\n")}`;
}

export async function docsPages(repositoryRoot: string) {
  const routes = new Map(guides.map(({ slug, source }) => [source, `/${slug}/`]));
  const articles = await Promise.all(guides.map(async ({ slug, label, source, section }) => {
    const contents = await readFile(resolve(repositoryRoot, source), "utf8");
    const { html, headings } = renderMarkdown(section ? excerpt(contents, section) : contents,
      (link) => repositoryLink(link, source, routes, repository), slug === "release-notes");
    const sections = headings.filter(({ level }) => level === 2 || level === 3).map(({ id, title, level }) => (
      `<li${level === 3 ? ' class="docs-subsection"' : ""}><a href="#${id}">${escapeHtml(title)}</a></li>`
    )).join("");
    const index = sections ? `<nav class="docs-sections" aria-label="On this page"><details>
      <summary>On this page</summary><ul>${sections}</ul>
    </details></nav>` : "";
    const sourceAnchor = section ? `#${headings[0].id}` : "";
    const markup = page({
      title: `${label} | bapX Docs`,
      description: `${label} documentation for bapX Agents.`,
      canonical: `${origin}/${slug}/`,
      surface: "Docs",
      body: layout(`${index}
  <article class="docs-article">${html}</article>
  <p class="docs-source"><a href="${repository}/blob/main/${source}${sourceAnchor}">View Markdown on GitHub</a></p>`, slug),
    });
    return [`docs/${slug}/index.html`, markup];
  }));
  return { "docs/index.html": home(), ...Object.fromEntries(articles) };
}
