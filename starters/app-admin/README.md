# Optional app admin starter

Copy this directory into a customer project to give that app its own sign-in,
enquiry forms, and `/admin` dashboard. Run it with Node.js 24 and `npm ci`, then
`npm start`. A project that does not opt in can use its own runtime and routes.

## Configure a site

| Environment variable | Value |
| --- | --- |
| `APP_ID` | Stable lowercase identifier for this app. Keep it across releases. |
| `APP_NAME` | Site display name. |
| `APP_ORIGIN` | Exact HTTPS origin for this site. For local preview use the exact loopback origin shown in the browser. |
| `APP_DATA_DIR` | Absolute path to this app's private persistent directory, outside all release and public directories. |
| `APP_OWNER_EMAIL` | Email address that can verify to become the first and only owner. |
| `APP_RESEND_API_KEY`, `APP_EMAIL_FROM` | Server-side Resend key and verified sender for email links. |
| `APP_GOOGLE_CLIENT_ID`, `APP_GOOGLE_CLIENT_SECRET` | Optional Google OAuth web client. Register `<APP_ORIGIN>/auth/google/callback` as its exact redirect URI. |
| `PORT` | Loopback listener port. Default `3000`. |

Keep credentials in the app's service environment. Use separate credentials and
storage for disposable and live apps. The operator who controls the site first
verifies the configured owner address, then opens `/admin` on the same site to
grant verified users staff access. Customers can submit forms. Staff can work
the app's enquiries. Only the owner can change roles and see signup and sign-in
activity. App sessions use host-only cookies and carry no bapX Team privileges.

Email verification links expire after ten minutes and must be confirmed in the
browser where the address was entered. Google sign-in uses the site's configured
OAuth client and validates the issuer, audience, nonce, and verified email.
Accounts keep their original signup method and never merge automatically across
providers. Signup counts are grouped by the verification date in UTC, with
subsequent successful sign-ins counted separately. The starter stores accepted
Resend message IDs while the link is active. Confirm delivery through the
provider's message status for a live check. [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) · [Resend message status](https://resend.com/docs/api-reference/emails/retrieve-email)

## Deploy and preserve data

The process listens on loopback. Route only the site's hostname to it through
the hosting layer, preserving the browser's `Host` and `Origin` and terminating
TLS there. Keep platform credentials and session headers out of those requests.
Apply per-source limits for starting sign-in at the hosting edge. The starter
limits challenge volume by provider, browser, and email address as applicable.

Use one writing process per app data directory. Stop and drain the previous app
process before starting the next release or rolling it back. Reuse the same data
directory for the same app with a separate service account and volume for each
project. Back up this directory independently of the release. Never serve it as
static files. The starter claims its data directory by app ID and writes complete
versioned snapshots atomically. A normal rollback changes code and form
definitions while keeping the current state. A future change to the state format
must include a tested compatibility or migration plan.

Edit `forms.json` to add or change forms. Keep form and field IDs stable when
renaming them. Submissions save the original form title and field IDs, labels,
and values. The lead's status, assignee, and notes can change independently.
Leads link to `/admin?submission=<id>#original-submission`. Operators can filter
and search the inbox, then export the matching submissions. The data and endpoint
behavior are independent of the app language. An adapted starter can use the
same route and identity contract with a different runtime.

## Verify

Run `npm test` for HTTP flows with a disposable mailbox and Google adapter, data
isolation, and restart/rollback checks. To test live, publish a disposable app
through the supported hosting path and use real test credentials for both
providers. Test the app's `/admin` after the creating agent session closes.
The selected site's Admin tab and hosted app lifecycle are tracked separately.
[Workflow and acceptance checks](../../gui/docs/app-admin-workflow-reference.md) · [Hosting #45](https://github.com/getwinharris/agency/issues/45) · [Hosted Sites #53](https://github.com/getwinharris/agency/issues/53)
