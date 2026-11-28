export const wordmark = "/brand/bapx-logo-main.svg";

export const brandStylesheet = '<link rel="stylesheet" href="/brand/lockup.css">';

export function brandLockup(className: string, width: number, suffix?: "Docs" | "MediaHub" | "Admin") {
  const label = suffix ? `bapX home from ${suffix}` : "bapX home";
  return `<a class="${className} bapx-brand-lockup" href="https://bapx.in/" aria-label="${label}"><img src="${wordmark}" alt="" width="${width}" height="${width / 3}">${suffix ? `<span class="bapx-brand-suffix">${suffix}</span>` : ""}</a>`;
}

export const faviconLinks = `<link rel="icon" href="/favicon.ico?v=5f983d83" sizes="48x48">
  <link rel="icon" href="/favicon-96x96.png?v=3860a303" type="image/png" sizes="96x96">
  <link rel="icon" href="/brand/favicon.svg?v=583e9a9d" type="image/svg+xml" sizes="any">`;
