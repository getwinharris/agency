# First-party web service

`cloudroom serve-web` serves the Agency public sites, accepts MediaHub project briefs, and provides a first-party operator workspace. This mode starts without agent credentials or a Cloudroom Core configuration.

- `BAPX_WEB_ROOT` points to the generated static site directory. Mount the artifact read-only in production.
- `BAPX_WEB_DATA` points to a separate persistent directory writable by the web service. The `inquiries` subdirectory uses mode `0700` and each record uses `0600`.
- `BAPX_WEB_LISTEN` defaults to `127.0.0.1:8080`. A container may bind an internal network address behind the first-party HTTPS proxy.
- `BAPX_ADMIN_PASSWORD_FILE` points to a private password file readable by the service. Set `BAPX_ADMIN_USERNAME` to change the default username, `operator`.

The apex and `www` serve the landing and `/privacy/`. The MediaHub host serves its landing and `/clients/<slug>/` portfolio pages. The Docs host serves the generated `docs/` subtree. Admin provides the sign-in page and same-origin `/api/admin/` endpoints on `admin.bapx.in`. Hosts share `/brand/` assets and MediaHub has its own `/mediahub/` assets. `GET /healthz` returns `ready: true`, `service: "bapx-web"`, and the image's Git SHA in `revision`. Local builds without `BAPX_WEB_REVISION` report a null revision.

`POST https://mediahub.bapx.in/api/mediahub/inquiries` accepts the first-party JSON form with a 16 KiB request limit. It requires the MediaHub web origin, a form start time between two seconds and one day ago, and express consent. A successful response returns the inquiry reference and creation time in Unix milliseconds. The service confirms receipt after writing a complete file to `BAPX_WEB_DATA/inquiries`.

An operator can review briefs, set their status, add private notes, and update the public MediaHub homepage headline and brief introduction. The server stores operator edits in the persistent data directory. Sign-in uses an HTTPS-only, host-only cookie and sessions end when the service restarts. Keep volume backups accessible to authorized operators only.

Links to MediaHub can open the brief with an existing service selected. Use
`/?service=websites#brief` for websites and commerce or
`/?service=automation#brief` for AI, data, and automation. The visitor can
change the service before submitting.

The Admin editor previews draft and published copy. Reset restores the loaded
published fields without sending a request. A revision conflict requires
refreshing the published copy before retrying. The editor keeps unsaved input
during that refresh.
