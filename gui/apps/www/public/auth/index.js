const byId = (id) => document.getElementById(id);
const page = document.body.dataset.accountPage;
const status = byId("account-status");

function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle("account-error", error);
}

async function request(path, data) {
  const options = { credentials: "same-origin", cache: "no-store", redirect: "error" };
  if (data !== undefined) {
    options.method = "POST";
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(data);
  }
  const response = await fetch(`/api/auth/${path}`, options);
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(typeof payload?.message === "string" ? payload.message : "Your bapX account is temporarily unavailable. Try again.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function readInvitation() {
  const invitations = new URLSearchParams(location.hash.slice(1)).getAll("invite");
  if (invitations.length) history.replaceState(null, "", location.pathname + location.search);
  return invitations.length === 1 && /^[a-f0-9]{64}$/.test(invitations[0]) ? invitations[0] : null;
}

async function showForm() {
  const form = byId("account-form");
  const submit = form.querySelector("button");
  const password = byId("password");
  const signup = page === "signup";
  if (signup) {
    addEventListener("hashchange", () => {
      if (new URLSearchParams(location.hash.slice(1)).has("invite")) location.reload();
    });
  }
  const invite = signup ? readInvitation() : null;

  if (signup && !invite) {
    message("Open the invitation link you received to create your bapX account.", true);
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const confirmation = byId("confirm-password");
    if (confirmation && password.value !== confirmation.value) {
      message("The passwords do not match.", true);
      confirmation.focus();
      return;
    }
    if (signup) {
      const length = Array.from(password.value).length;
      if (length < 15 || length > 128) {
        message("Use a password with 15 to 128 characters.", true);
        password.focus();
        return;
      }
    }
    submit.disabled = true;
    message("");
    try {
      const data = signup
        ? { invite, password: password.value }
        : { identifier: byId("identifier").value.trim(), password: password.value };
      await request(page, data);
      form.reset();
      location.replace("/account/");
    } catch (error) {
      message(error.status ? error.message : "Could not reach bapX. Try again.", true);
      password.focus();
      submit.disabled = false;
    }
  });

  if (!signup) {
    try {
      await request("session");
      location.replace("/account/");
      return;
    } catch (error) {
      if (error.status !== 401) message("Could not check your session. You can still try signing in.", true);
    }
  }
  form.hidden = false;
  submit.disabled = false;
}

function displayManagement(open) {
  byId("account-view").hidden = open;
  byId("admin-workspace").hidden = !open;
  byId("show-admin").setAttribute("aria-pressed", String(open));
  byId("show-account").setAttribute("aria-pressed", String(!open));
}

function displayIdentity(account) {
  byId("account-identifier").textContent = account.identifier;
  byId("operator-menu").hidden = account.role !== "operator";
  byId("account-details").hidden = false;
}

async function showAccount() {
  message("Checking your session…");
  const adminButton = byId("show-admin");
  byId("show-account").addEventListener("click", () => displayManagement(false));
  adminButton.addEventListener("click", async () => {
    adminButton.disabled = true;
    try {
      const account = await request("session");
      displayIdentity(account);
      if (account.role !== "operator") {
        message("Your bapX account does not have operator access.", true);
        displayManagement(false);
        return;
      }
      displayManagement(true);
      dispatchEvent(new CustomEvent("bapx:open-admin", { detail: account.identifier }));
      byId("management").focus();
    } catch (error) {
      if (error.status === 401) location.replace("/sign-in/");
      else message("Could not check your Admin access. Try again.", true);
    } finally {
      adminButton.disabled = false;
    }
  });
  addEventListener("bapx:admin-access-denied", () => {
    displayManagement(false);
    byId("operator-menu").hidden = true;
    message("Your bapX account does not have operator access.", true);
  });
  try {
    displayIdentity(await request("session"));
    message("");
  } catch (error) {
    if (error.status === 401) location.replace("/sign-in/");
    else message("Could not load your account. Refresh to try again.", true);
  }
  byId("account-sign-out").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await request("sign-out", {});
      location.replace("/sign-in/");
    } catch (error) {
      if (error.status === 401) location.replace("/sign-in/");
      else message("Could not sign out. Try again.", true);
      button.disabled = false;
    }
  });
}

if (page === "account") void showAccount();
else void showForm();
