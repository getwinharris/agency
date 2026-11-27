import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { appAccounts, authHandlers, initializeOwnerPassword, sessionFor } from "./auth.mjs";
import { emailAddress, validateForms } from "./config.mjs";
import { openStore } from "./store.mjs";
import { escapeHtml, renderAdmin, renderHome, renderPage } from "./views.mjs";

const leadStatuses = new Set(["new", "in_progress", "closed"]);
const appStaff = (user) => user?.role === "owner" || user?.role === "staff";

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function redirect(response, location, cookies) {
  if (cookies) response.setHeader("Set-Cookie", cookies);
  response.writeHead(303, { Location: location }).end();
}

function html(response, body, status = 200) {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" }).end(body);
}

async function formBody(request) {
  if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers["content-type"] ?? "")) {
    throw new RequestError(415, "Submit this request through the site's form.");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 40_960) {
      request.resume();
      throw new RequestError(413, "The form submission is too large.");
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function requireSession(config, request, state, input, allowed = (session) => Boolean(session)) {
  const session = sessionFor(config, request, state);
  if (!session) throw new RequestError(401, "Sign in to continue.");
  if (!allowed(session) || (input && input.get("_csrf") !== session.csrf)) {
    throw new RequestError(403, "This account cannot perform that action.");
  }
  return session;
}

function fieldsOf(form, input) {
  return form.fields.map((field) => {
    const value = input.get(field.id)?.trim() ?? "";
    const limit = field.type === "textarea" ? 4000 : 254;
    if ((field.required && !value) || value.length > limit || (value && field.type === "email" && !emailAddress(value))) {
      throw new RequestError(400, `Check the value for ${field.label}.`);
    }
    return { id: field.id, label: field.label, type: field.type, value };
  });
}

function activityOf(state) {
  const days = new Map();
  function dayRecord(when) {
    const day = when.slice(0, 10);
    if (!days.has(day)) days.set(day, { day, email: 0, google: 0, signIns: 0 });
    return days.get(day);
  }
  for (const user of state.users) dayRecord(user.verifiedAt)[user.signupMethod]++;
  for (const entry of state.signIns) dayRecord(entry.occurredAt).signIns++;
  return [...days.values()].sort((left, right) => left.day.localeCompare(right.day));
}

function filtersOf(query) {
  return { q: (query.get("q") ?? "").trim().slice(0, 300), form: query.get("form") ?? "",
    status: query.get("status") ?? "", assignee: query.get("assignee") ?? "" };
}

function filteredSubmissions(submissions, filters) {
  const needle = filters.q.toLowerCase();
  return submissions.filter(({ formId, formTitle, fields, lead }) =>
    (!filters.form || formId === filters.form) && (!filters.status || lead.status === filters.status) &&
    (!filters.assignee || (lead.assigneeId ?? "unassigned") === filters.assignee) &&
    (!needle || [formTitle, ...fields.map((field) => field.value), ...lead.notes.map((note) => note.text)]
      .some((value) => value.toLowerCase().includes(needle)))).reverse();
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function exportSubmissions(response, submissions, users) {
  const rows = [["Submission ID", "Form", "Submitted at", "Status", "Assignee", "Original submitted fields"]];
  for (const submission of submissions) {
    rows.push([submission.id, submission.formTitle, submission.createdAt, submission.lead.status,
      users.find((user) => user.id === submission.lead.assigneeId)?.email,
      JSON.stringify(submission.fields)]);
  }
  response.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=submissions.csv" })
    .end(`${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`);
}

export async function createApp({ config, sendEmail = null, google = null, reportError = console.error }) {
  const store = await openStore({ dataDir: config.dataDir, appId: config.appId });
  await initializeOwnerPassword(config, store);
  const forms = validateForms(config.forms).map((form) => ({ ...form,
    revision: createHash("sha256").update(JSON.stringify(form)).digest("hex") }));
  const auth = authHandlers({ config, store, sendEmail, google });
  const home = (options) => renderHome({ appName: config.appName, emailEnabled: Boolean(sendEmail),
    googleEnabled: Boolean(google), ...options });

  async function get(request, response, url) {
    const route = url.pathname;
    const query = url.searchParams;
    if (route === "/healthz") return response.writeHead(204).end();
    if (route === "/auth/email/verify") {
      const page = auth.emailPage(request, query.get("token"));
      if (!page) throw new RequestError(401, "Open the confirmation link in the browser where you requested it.");
      return html(response, page);
    }
    if (route === "/auth/google") {
      const start = await auth.beginGoogle(request);
      if (!start) throw new RequestError(503, "Google sign-in is unavailable.");
      return redirect(response, start.location, start.cookie);
    }
    if (route === "/auth/google/callback") {
      const cookie = await auth.verifyGoogle(request, query);
      if (!cookie) throw new RequestError(401, "Google sign-in could not be confirmed. Use your original sign-in method.");
      return redirect(response, "/", cookie);
    }
    if (route !== "/" && route !== "/admin") throw new RequestError(404, "This page could not be found.");
    const state = await store.read();
    const message = query.has("saved") ? "Changes saved." : query.has("submitted") ? "Enquiry submitted." :
      query.has("email-verified") ? "Email address verified." : "";
    if (route === "/") {
      const session = sessionFor(config, request, state);
      const form = forms.find((entry) => entry.id === query.get("form")) ?? forms[0];
      return html(response, home({ session, form, message, signup: query.has("signup") }));
    }
    const session = sessionFor(config, request, state);
    if (!session) return html(response, home({ message: "Sign in to open Admin." }), 401);
    if (!appStaff(session)) throw new RequestError(403, "This account cannot open Admin.");
    const filters = filtersOf(query);
    const submissions = filteredSubmissions(state.submissions, filters);
    const accounts = appAccounts(state);
    const users = session.role === "owner" ? accounts : accounts.filter(appStaff);
    if (query.get("export") === "csv") return exportSubmissions(response, submissions, users);
    const selected = state.submissions.find((item) => item.id === query.get("submission"));
    const inventory = new Map(forms.map((form) => [form.id, form]));
    for (const item of state.submissions) {
      if (!inventory.has(item.formId)) inventory.set(item.formId, { id: item.formId, title: item.formTitle, fields: [], archived: true });
    }
    return html(response, renderAdmin({ appName: config.appName, session, forms: [...inventory.values()], submissions,
      users, metrics: session.role === "owner" ? activityOf(state) : [], filters, selected, message }));
  }

  async function post(request, response, url) {
    const route = url.pathname;
    if (request.headers.origin !== config.origin) throw new RequestError(403, "Submit from this site.");
    const input = await formBody(request);
    if (route === "/auth/password/signup" || route === "/auth/password/signin") {
      const signup = route.endsWith("/signup");
      const result = await auth.passwordAuth(input, signup);
      if (result.cookie) return redirect(response, "/", result.cookie);
      if (result.limited) {
        response.setHeader("Retry-After", "60");
        return html(response, home({ signup, message: "Too many attempts. Try again shortly." }), 429);
      }
      if (signup && result.invalid) {
        return html(response, home({ signup, message: "Enter a valid email address and a 15 to 128 character password." }), 400);
      }
      const message = signup ? "Could not create an account with those details. If you have an account, sign in." :
        "The email address or password is incorrect.";
      return html(response, home({ signup, message }), signup ? 409 : 401);
    }
    if (route === "/auth/email") {
      if (!sendEmail) throw new RequestError(503, "Email links are unavailable for this app.");
      const cookie = await auth.beginEmail(request, input);
      if (!cookie) throw new RequestError(400, "Enter a valid email address.");
      response.setHeader("Set-Cookie", cookie);
      const session = sessionFor(config, request, await store.read());
      return html(response, home({ session, form: forms[0], message: "Check your email for a confirmation link." }));
    }
    if (route === "/auth/email/verify") {
      const result = await auth.verifyEmail(request, input);
      if (!result) throw new RequestError(401, "This link cannot be used. Request a new link or use your original sign-in method.");
      return redirect(response, result.verified ? "/?email-verified=1" : "/", result.cookie);
    }
    if (route === "/auth/signout") {
      const session = requireSession(config, request, await store.read(), input);
      return redirect(response, "/", await auth.signout(session));
    }
    const parts = route.split("/").slice(1);
    if (parts.length === 2 && parts[0] === "forms") {
      const form = forms.find((definition) => definition.id === parts[1]);
      if (!form) throw new RequestError(404, "This form could not be found.");
      if (form.revision !== input.get("_revision")) throw new RequestError(409, "This form has changed. Reopen it and submit again.");
      const fields = fieldsOf(form, input);
      await store.update((state) => {
        const session = requireSession(config, request, state, input);
        state.submissions.push({ id: randomUUID(), formId: form.id, formTitle: form.title, fields,
          formRevision: form.revision, userId: session.userId, createdAt: new Date().toISOString(),
          lead: { status: "new", assigneeId: null, notes: [] } });
      });
      return redirect(response, "/?submitted=1");
    }
    if (parts.length === 3 && parts[0] === "admin" && parts[1] === "submissions") {
      const id = parts[2];
      const status = input.get("status");
      const assigneeId = input.get("assignee") || null;
      const note = input.get("note")?.trim() ?? "";
      if (!leadStatuses.has(status) || note.length > 4000) throw new RequestError(400, "Check the enquiry status or note.");
      await store.update((state) => {
        const session = requireSession(config, request, state, input, appStaff);
        const submission = state.submissions.find((item) => item.id === id);
        if (!submission) throw new RequestError(404, "This submission could not be found.");
        if (assigneeId && !appAccounts(state).some((user) => user.id === assigneeId && appStaff(user))) {
          throw new RequestError(400, "Choose an active app staff member.");
        }
        submission.lead.status = status;
        submission.lead.assigneeId = assigneeId;
        if (note) submission.lead.notes.push({ text: note, author: session.email, createdAt: new Date().toISOString() });
      });
      return redirect(response, `/admin?submission=${encodeURIComponent(id)}&saved=1`);
    }
    if (parts.length === 3 && parts[0] === "admin" && parts[1] === "roles") {
      const role = input.get("role");
      if (role !== "staff" && role !== "customer") throw new RequestError(400, "Choose an app role.");
      await store.update((state) => {
        requireSession(config, request, state, input, (session) => session.role === "owner");
        const user = appAccounts(state).find((entry) => entry.id === parts[2]);
        if (!user || user.role === "owner") throw new RequestError(404, "This role cannot be changed.");
        if (role === "staff" && !user.verifiedAt) throw new RequestError(403, "Verify the app account’s email before assigning staff access.");
        user.role = role;
        if (role === "customer") {
          for (const submission of state.submissions) {
            if (submission.lead.assigneeId === user.id) submission.lead.assigneeId = null;
          }
        }
      });
      return redirect(response, "/admin?saved=1");
    }
    throw new RequestError(404, "This action could not be found.");
  }

  return createServer({ requestTimeout: 20_000, headersTimeout: 10_000 }, async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    // Retain the Origin on browser form POSTs without sending link tokens in the referrer.
    response.setHeader("Referrer-Policy", "strict-origin");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      if (request.headers.host !== config.host || !request.url?.startsWith("/") || request.url.startsWith("//")) {
        throw new RequestError(400, "This request did not match the site's host.");
      }
      const url = new URL(request.url, config.origin);
      if (url.origin !== config.origin) throw new RequestError(400, "This request did not match the site's origin.");
      if (request.method === "GET") return await get(request, response, url);
      if (request.method === "POST") return await post(request, response, url);
      response.setHeader("Allow", "GET, POST");
      throw new RequestError(405, "This method is not supported.");
    } catch (error) {
      if (response.headersSent) return response.destroy();
      if (!(error instanceof RequestError)) reportError(error);
      return html(response, renderPage("Request unavailable", `<main><h1>Request unavailable</h1><p>${escapeHtml(
        error instanceof RequestError ? error.message : "Try again shortly.",
      )}</p><a href="/">Return to the site</a></main>`), error instanceof RequestError ? error.status : 500);
    }
  });
}
