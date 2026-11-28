import { brandLockup, brandStylesheet, faviconLinks } from "../brand.ts";
import { adminWorkspace } from "../admin/pages.ts";

const origin = "https://bapx.in";
export const signInUrl = `${origin}/sign-in/`;

function accountPage(route: "sign-in" | "signup" | "account", title: string, content: string) {
  const signedInPage = route === "account";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <title>${title} | bapX</title>
  <link rel="canonical" href="${origin}/${route}/">
  ${brandStylesheet}
  ${faviconLinks}
  <link rel="stylesheet" href="/site.css">
  <link rel="stylesheet" href="/auth/index.css">${signedInPage ? `
  <link rel="stylesheet" href="/auth/management.css">
  <script type="module" src="/admin/index.js"></script>` : ""}
  <script type="module" src="/auth/index.js"></script>
</head>
<body data-account-page="${route}">
  <a class="skip" href="#main">Skip to content</a>
  <header class="shell site-header">
    ${brandLockup("brand", 120)}${signedInPage ? `
    <nav class="account-menu" id="operator-menu" aria-label="Account" hidden>
      <button type="button" id="show-account" aria-controls="account-view" aria-pressed="true">Account</button>
      <button type="button" id="show-admin" aria-controls="admin-workspace" aria-pressed="false">Admin</button>
    </nav>` : ""}
  </header>
  <main id="main">
    <div class="account-layout" id="account-view">
      <section class="account-card" aria-labelledby="account-heading">
        <h1 id="account-heading">${title}</h1>
        ${content}
        <p id="account-status" class="account-status" role="status"></p>
        <noscript><p>Enable JavaScript to use your bapX account.</p></noscript>
      </section>
    </div>
    ${signedInPage ? adminWorkspace(true) : ""}
  </main>
  <footer class="shell site-footer"><nav aria-label="Footer">
    <a href="https://docs.bapx.in/">Docs</a>
    <a href="/privacy/">Privacy</a>
  </nav></footer>
</body>
</html>`;
}

export function accountPages(): Record<string, string> {
  return {
    "sign-in/index.html": accountPage("sign-in", "Sign in to bapX", `
      <form class="account-form" id="account-form" method="post" action="/api/auth/sign-in">
        <label for="identifier">Email or username</label>
        <input id="identifier" name="identifier" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="254" required>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" maxlength="256" required>
        <button class="button button-primary" type="submit" disabled>Sign in</button>
      </form>`),
    "signup/index.html": accountPage("signup", "Create your bapX account", `
      <form class="account-form" id="account-form" method="post" action="/api/auth/signup" hidden>
        <p class="account-help" id="password-help">Choose a password with at least 15 characters.</p>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="new-password" aria-describedby="password-help" maxlength="256" required>
        <label for="confirm-password">Confirm password</label>
        <input id="confirm-password" type="password" autocomplete="new-password" maxlength="256" required>
        <button class="button button-primary" type="submit" disabled>Create account</button>
      </form>
      <p class="account-help"><a href="/sign-in/">Already have an account? Sign in</a></p>`),
    "account/index.html": accountPage("account", "Your bapX account", `
      <div class="account-details" id="account-details" hidden>
        <dl>
          <dt>Signed in as</dt>
          <dd id="account-identifier"></dd>
        </dl>
        <a href="https://docs.bapx.in/private-core/">Set up bapX Agents</a>
        <button class="button button-secondary" id="account-sign-out" type="button">Sign out</button>
      </div>`),
  };
}
