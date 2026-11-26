# First-party web service

`cloudroom serve-web` serves the Agency public sites and accepts MediaHub project briefs. This mode starts without agent credentials, sessions, or a Cloudroom Core configuration.

- `BAPX_WEB_ROOT` points to the generated static site directory. Mount the artifact read-only in production.
- `BAPX_WEB_DATA` points to a separate persistent directory writable by the web service. The `inquiries` subdirectory uses mode `0700` and each record uses `0600`.
- `BAPX_WEB_LISTEN` defaults to `127.0.0.1:8080`. A container may bind an internal network address behind the first-party HTTPS proxy.

The apex and `www` serve the landing and `/privacy/`. The MediaHub host serves its landing and `/clients/<slug>/` portfolio pages. The docs host serves the generated `docs/` subtree. All four public hosts can read shared `/brand/` assets and `/site.css`. MediaHub can also read `/mediahub/` assets. `GET /healthz` returns `{"ready":true,"service":"bapx-web"}`.

`POST https://mediahub.bapx.in/api/mediahub/inquiries` accepts the first-party JSON form with a 16 KiB request limit. It requires the MediaHub web origin, a form start time between two seconds and one day ago, and express consent. A successful response returns the inquiry reference and creation time in Unix milliseconds. The service confirms receipt after writing a complete file to `BAPX_WEB_DATA/inquiries`. Authorized operators can review that private directory and back it up as part of site data. The public web service has no inquiry retrieval endpoint.
