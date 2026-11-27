import MarkdownIt from "markdown-it";
import { posix } from "node:path";

const markdown = new MarkdownIt({ html: false });
const fence = markdown.renderer.rules.fence!;
markdown.renderer.rules.fence = (...args) => fence(...args).replace("<pre>", '<pre tabindex="0">');

export function escapeHtml(value: string) {
  return markdown.utils.escapeHtml(value);
}

export function renderMarkdown(source: string, resolveLink: (href: string) => string) {
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

  return { html: markdown.renderer.render(tokens, markdown.options, {}), headings };
}

markdown.renderer.rules.docs_table_open = (tokens, index) =>
  `<div class="docs-table" role="region" tabindex="0" aria-label="${tokens[index].meta} table"><table>\n`;
markdown.renderer.rules.docs_table_close = () => "</table></div>\n";

export function repositoryLink(href: string, from: string, routes: ReadonlyMap<string, string>, repository: string) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href)) return href;

  const [, path, suffix] = /^([^?#]+)(.*)$/.exec(href) ?? [];
  if (!path) return href;

  const target = posix.join(posix.dirname(from), path);
  return `${routes.get(target) ?? `${repository}/blob/main/${target}`}${suffix}`;
}
