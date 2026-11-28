import MarkdownIt from "markdown-it";
import { posix } from "node:path";

const markdown = new MarkdownIt({ html: false });
const fence = markdown.renderer.rules.fence!;
markdown.renderer.rules.fence = (...args) => fence(...args).replace("<pre>", '<pre tabindex="0">');

export function escapeHtml(value: string) {
  return markdown.utils.escapeHtml(value);
}

function renderReleaseTimeline(tokens: ReturnType<typeof markdown.parse>) {
  const render = (start = 0, end = tokens.length) =>
    markdown.renderer.render(tokens.slice(start, end), markdown.options, {});
  const heading = tokens.findIndex((token) => token.attrGet("id") === "verified-web-deployments");
  if (heading === -1) return render();

  const nextSection = tokens.findIndex((token, index) => index > heading &&
    token.level === 0 && token.type === "heading_open" && ["h1", "h2"].includes(token.tag));
  const end = nextSection === -1 ? tokens.length : nextSection;
  const entries: number[] = [];
  for (let index = heading + 1; index < end; index++) {
    const token = tokens[index];
    if (token.level === 0 && token.type === "heading_open" && token.tag === "h3") {
      entries.push(index);
    }
  }
  if (entries.length === 0) return render();

  const items = entries.map((start, index) => `<li class="release-entry">
    ${render(start, start + 3)}
    <div class="release-details">${render(start + 3, entries[index + 1] ?? end)}</div>
  </li>`).join("\n");
  return `${render(0, entries[0])}
<ol class="release-timeline" role="list" reversed aria-labelledby="verified-web-deployments">
${items}
</ol>
${render(end)}`;
}

export function renderMarkdown(source: string, resolveLink: (href: string) => string, timeline = false) {
  const tokens = markdown.parse(source, {});
  const headings: { id: string; title: string; level: number }[] = [];
  const ids = new Set(["main"]);

  for (const [index, token] of tokens.entries()) {
    if (token.type === "heading_open") {
      const title = tokens[index + 1].children?.map((child) => child.content).join("") ?? "";
      const base = title.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "").replace(/ /g, "-") || "section";
      let id = base;
      for (let suffix = 1; ids.has(id); suffix++) id = `${base}-${suffix}`;
      ids.add(id);
      token.attrSet("id", id);
      headings.push({ id, title, level: Number(token.tag.slice(1)) });
    }

    if (token.type === "table_open") {
      const section = escapeHtml(headings.at(-1)?.title ?? "Documentation");
      token.type = "docs_table_open";
      token.meta = section;
    }
    if (token.type === "table_close") token.type = "docs_table_close";
    if (token.type === "th_open") token.attrSet("scope", "col");

    for (const child of token.children ?? []) {
      const href = child.type === "link_open" && child.attrGet("href");
      if (href) child.attrSet("href", resolveLink(href));
    }
  }

  const html = timeline ? renderReleaseTimeline(tokens) : markdown.renderer.render(tokens, markdown.options, {});
  return { html, headings };
}

markdown.renderer.rules.docs_table_open = (tokens, index) =>
  `<div class="docs-table" role="region" tabindex="0" aria-label="${tokens[index].meta} table"><table>\n`;
markdown.renderer.rules.docs_table_close = () => "</table></div>\n";

export function repositoryLink(href: string, from: string, routes: ReadonlyMap<string, string>, repository: string) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href)) return href;

  const [, path, suffix] = href.match(/^([^?#]+)(.*)$/) ?? [];
  if (!path) return href;

  const target = posix.join(posix.dirname(from), path);
  return `${routes.get(target) ?? `${repository}/blob/main/${target}`}${suffix}`;
}
