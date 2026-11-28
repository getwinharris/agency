# Optional app admin starter

Copy this directory into a customer project to give that app its own sign-in,
enquiry forms, and `/admin` dashboard. Run it with Node.js 24 and `npm ci`, then
`npm start`. Email and password work with app-local storage. A project that does
not opt in can use its own runtime and routes.

## Configure a site

| Environment variable | Value |
| --- | --- |
| `APP_ID` | Stable lowercase identifier for this app. Keep it across releases. |
| `APP_NAME` | Site display name. |
| `APP_ORIGIN` | Exact HTTPS origin for this site. For local preview use the exact loopback origin shown in the browser. |
| `APP_DATA_DIR` | Absolute path to this app's private persistent directory, outside all release and public directories. |
| `APP_OWNER_EMAIL` | Reserved email address of the app owner. |
| `APP_OWNER_PASSWORD_FILE` | Absolute path to an app-only secret file containing the initial owner password. The startup process reads it when there is no owner password yet. Remove the file reference after provisioning. |
| `APP_RESEND_API_KEY`, `APP_EMAIL_FROM` | Optional Resend key and verified sender for email verification and email-link sign-in. |
| `APP_GOOGLE_CLIENT_ID`, `APP_GOOGLE_CLIENT_SECRET` | Optional Google OAuth web client. Register `<APP_ORIGIN>/auth/google/callback` as its exact redirect URI. |
| `APP_BIND_ADDRESS` | Listener address. Default `127.0.0.1`. Use `::1` for IPv6 loopback or `0.0.0.0` when the app runs on a private network behind a TLS proxy. The latter requires an HTTPS `APP_ORIGIN`. |
| `PORT` | App listener port. Default `3000`. |

Keep credentials in the app's secret configuration. Use separate credentials and
storage for disposable and live apps. To provision password access for the owner,
mount their initial password as a private, service-readable file outside the
release and configure `APP_OWNER_PASSWORD_FILE`. Provide the password to the
operator through the app's secret workflow. Plaintext is read at startup and the
starter saves a salted scrypt hash. An existing owner can continue using their
verified email link, and a provisioned owner password is retained across restarts.
Public signup reserves the owner address and creates customer accounts only.

Customers can sign in with an email and a 15–128 character password and submit
forms. A password signup starts with an unverified address. The owner can assign
enquiries to themselves and can grant staff access after the customer's address
is proved. Staff can work the app's enquiries. Only the owner can change roles
and see signup and sign-in activity. App sessions use host-only cookies and carry
no bapX Team privileges. [Password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

When email delivery is configured, password users can verify their address from
the signed-in account. The ten-minute link must be confirmed in the same browser
and session. Email-link sign-in still works for existing users. An independent
provider proof can claim an address used by an unverified customer account, with
its own identity and credentials. The earlier account's submission IDs remain
in the app. Google sign-in uses the site's configured OAuth client and validates
the issuer, audience, nonce, and verified email. Accounts keep their original
signup method. Signup counts are grouped by the verification date in UTC, with
subsequent successful sign-ins counted separately. The starter stores accepted
Resend message IDs while the link is active. Confirm delivery through the
provider's message status for a live check. [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) · [Resend message status](https://resend.com/docs/api-reference/emails/retrieve-email)

## Deploy and preserve data

The process listens on loopback by default. For a TLS proxy in a separate
container, set `APP_BIND_ADDRESS=0.0.0.0` and attach the app and proxy to a
dedicated private bridge with no unrelated containers. Keep the app port
unpublished on the host. Configure the proxy
to terminate TLS for the exact hostname in `APP_ORIGIN` and preserve the
browser's `Host`, `Origin`, and the app's host-only sign-in and session cookies.
Strip unrelated cookies and Authorization headers. A direct upstream health
check must send the configured `Host` for `GET /healthz` to return 204. When
using live credentials, allow outbound HTTPS to the configured sign-in providers.

Apply per-source limits for starting sign-in at the hosting edge. The starter
limits challenge volume by provider, browser, and email address, and bounds
password attempts and concurrent hashing in the app process.

Use one writing process per app data directory. Stop and drain the previous app
process before starting the next release or rolling it back. Reuse the same data
directory for the same app with a separate service account and volume for each
project. Back up this directory independently of the release. Never serve it as
static files. The starter claims its data directory by app ID and writes complete
versioned snapshots atomically. A normal rollback changes code and form
definitions while keeping the current state. A future change to the state format
must include a tested compatibility or migration plan.
Releases before password sign-in can still read the verified account and form
records. During such a rollback, only the older release's sign-in methods are
available. Returning to the password-enabled release restores its credentials.
If the older release verifies the same provisioned owner's mailbox, the upgrade
preserves the original owner ID and password along with both releases' records.

Edit `forms.json` to add or change forms. Keep form and field IDs stable when
renaming them. Submissions save the original form title and field IDs, labels,
and values. The lead's status, assignee, and notes can change independently.
Leads link to `/admin?submission=<id>#original-submission`. Operators can filter
and search the inbox, then export the matching submissions. The data and endpoint
behavior are independent of the app language. An adapted starter can use the
same route and identity contract with a different runtime.

## Verify

Run `npm test` for provider-free password signup and sign-in, optional provider
compatibility with disposable adapters, data isolation, and restart/rollback.
To test live, publish a disposable app through the supported hosting path and
verify password access to `/admin` after the creating agent session closes. Use
separate disposable provider credentials for any optional provider checks.
The selected site's Admin tab and hosted app lifecycle are tracked separately.
[Workflow and acceptance checks](../../gui/docs/app-admin-workflow-reference.md) · [Hosting #45](https://github.com/getwinharris/agency/issues/45) · [Hosted Sites #53](https://github.com/getwinharris/agency/issues/53)
