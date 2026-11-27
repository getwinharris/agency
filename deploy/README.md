# Agency web deployment

The `Public web` Actions workflow builds and tests pull requests that change web inputs. Every push to `main` calls the existing App and Core checks on that revision before building, smoke testing, and publishing `ghcr.io/getwinharris/agency-web:<commit>`. A successful run attaches the immutable image digest, revision, and checksummed Compose configuration as `agency-web-release`.

Hostinger’s systemd timer checks for a successful run at the tip of `main` every three minutes. The driver downloads that run’s release metadata and Compose configuration, verifies the digest and OCI revision, and updates only the `agency-web` service. Changes to the Compose settings ship automatically with the verified commit.

Install reviewed copies of the bootstrap Compose override, host script, and systemd units under root ownership on a new host. The driver uses the Docker Compose project at `/docker/traefik-vmm1`. It requires Docker Compose, `curl`, `jq`, `flock`, and the host operator's GitHub CLI with read access to Actions artifacts. If the registry package is private, that credential needs package read access. The job keeps temporary registry credentials separate from the host Docker configuration. Apply changes to the host driver or systemd schedule with the install commands below.

Provision the Admin password file once. Store the generated credential in the operator's password manager. The service reads it as UID 10001 through a read-only mount. For rotation, update the file in place with a fresh value and restart `agency-web` to invalidate existing sessions.

```sh
sudo install -o root -g root -d -m 0700 /etc/bapx-agency
sudo bash -c 'set -euo pipefail
  umask 077
  set -o noclobber
  openssl rand -hex 32 > /etc/bapx-agency/admin-password
  chown 10001:10001 /etc/bapx-agency/admin-password
  chmod 0400 /etc/bapx-agency/admin-password'
```

```sh
sudo install -o root -g root -m 0644 deploy/compose.web.yml /docker/traefik-vmm1/agency-web.compose.yml
sudo install -d -o root -g root -m 0755 /usr/local/libexec
sudo install -o root -g root -m 0755 deploy/deploy-web.sh /usr/local/libexec/bapx-agency-web-deploy
sudo install -o root -g root -m 0644 deploy/bapx-agency-web-deploy.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start bapx-agency-web-deploy.service
sudo systemctl enable --now bapx-agency-web-deploy.timer
```

The deployment checks the container by digest and tests the landing, Docs, MediaHub, and Admin through the local TLS proxy before saving `/var/lib/bapx-agency-web-deploy/last-good.json`. Each host’s `/healthz` must report the release commit. The Admin session endpoint must require sign-in. These checks use read-only requests and leave production data intact. The state file records the run, `main` SHA, deployed digest, Compose checksum, and previous image.

Failed checks restore and verify the previously healthy image and its routing configuration. The timer rechecks the live release. A persistent failure with a verified fallback also restores that release and records the SHA that is now serving. On the first placement, a failed deployment removes the new service. A confirmed rollback skips the failed workflow attempt on subsequent checks. Rerun the workflow after correcting the cause. A failed rollback is logged and remains eligible for recovery. Retain the previous image locally. To pause deployment, stop the timer. The web data volume persists across image replacement.

Sign in to Admin as `operator` to view MediaHub inquiries and publish changes to its homepage. The web data volume contains briefs, operator notes, and published copy. Keep backups private because these include contact details and consent.

## Publish the sandbox pilot

After the web release includes the exact pilot route and read-only release volume, approve one project under the [workspace layout](../core/docs/sites.md). Run the project's build in its own sandbox and have it produce `dist/index.html` and any standalone assets. Check that all output can be made public.

From the Agency checkout on Hostinger, replace the three labels with the approved project identifiers.

```sh
sudo bash deploy/publish-site.sh ACCOUNT BUSINESS PROJECT
```

The helper uses the verified web image from the deployment record. The native `cloudroom publish-site stage` command copies the approved build into an operator-private directory. Then `cloudroom publish-site release` runs once in the same image with a read-only snapshot and a writable `traefik-vmm1_agency-web-sites` volume. The web service reads this separate volume at `/var/lib/bapx-sites`. The first release binds the label to the approved project. Run the same command for its next build.

Check the certificate, index, and representative asset at [sandbox-check.app.bapx.in](https://sandbox-check.app.bapx.in/). Check that traversal attempts and `/api/admin/session` return 404 there and that the Admin host still requires authentication. Verify that a different hostname receives no project content. Use the existing four-host health checks for first-party release verification. Preserve the site release volume on deployment and keep its backups private.

## Verify an isolated dynamic app deployment

Run `bash deploy/dynamic-pilot/verify.sh SOURCE_SHA` with Docker and OpenSSL.
The source commit must include the app starter's bridge listener and password
sign-in. The verifier builds the existing starter from that exact commit and
from the pinned email-link baseline in [#72](https://github.com/getwinharris/agency/pull/72).

The fixture puts the app on a private internal Docker bridge with no published
app ports. The TLS proxy forwards the app's email challenge and session cookies
and strips unrelated credentials. The sample uses disposable fixture mail and
an app-only password. The old image saves an enquiry. The new image reads it,
saves another, and replaces its container. The old image then reads both
enquiries and both sessions from the same private volume. Each health check
verifies the serving Git revision.

Set `BAPX_PILOT_KEEP=1` to leave the verified candidate available on the VPS
loopback interface for staging. Only the proxy joins the separate ingress
bridge. The script prints the fixture CA and a hostname to resolve to
127.0.0.1 for HTTPS at `https://dynamic-check.app.bapx.in:8443/`. This staging
mode uses neither production DNS nor first-party proxy configuration. The
default CI run stops its disposable containers and network at the end. The
test volumes and private verification file remain available for inspection.

## Publish the Node app sample

The sample service consumes an `agency-app-sample-release` artifact from the
same successful `Public web` run as the first-party platform. It also checks
that the exact current `main` revision is already serving on bapx.in. The
release workflow publishes the sample image by digest and uses
`deploy/app-sample/bundle.sh` to package its manifest, proxy, and Compose files.
Run `deploy/app-sample/test.sh IMAGE FULL_MAIN_SHA` against the built image
before publishing it.

The named route is [dynamic-check.app.bapx.in](https://dynamic-check.app.bapx.in/).
This is a single operator-managed sample from the reviewed Agency source. It
uses Traefik's existing HTTPS certificate resolver and an exact-host proxy.
The Node process joins only the sample's internal network. The proxy forwards
the sample's own session cookie, origin, and form content type. It limits
writes, and the sample uses no mail delivery, Google sign-in, platform secrets,
or shared Agency data. Its separate Docker volume keeps demo accounts and
enquiries across a process replacement or image rollback. Keep the previous
sample image locally.

Once the approved release workflow publishes the sample artifact, the
Hostinger release service invokes the sample service after the first-party
rollout. For a first-time sample setup, create a new sample-only owner password
file. Store the disposable owner
credential separately from the bapX operator credential.

```sh
sudo bash -c 'set -euo pipefail
  umask 077
  set -o noclobber
  openssl rand -hex 32 > /etc/bapx-agency/sample-owner-password
  chown 1000:1000 /etc/bapx-agency/sample-owner-password
  chmod 0400 /etc/bapx-agency/sample-owner-password'
sudo install -o root -g root -m 0755 deploy/app-sample/deploy.sh /usr/local/libexec/bapx-agency-app-sample-deploy
sudo install -o root -g root -m 0644 deploy/app-sample/bapx-agency-app-sample.service /etc/systemd/system/
sudo systemctl daemon-reload
```

The next web timer run invokes the sample service. It checks the sample's
public TLS route, app revision header, and signed-out Admin response before
recording success under `/var/lib/bapx-agency-app-sample`. On rollout failure
it restores the previous sample bundle, or removes the sample containers on
first placement. The data volume is kept. Check the service journal for the
failed attempt and rerun CI after fixing the cause.

For acceptance, read the serving SHA from `/healthz`, then exercise signup
with a disposable `example.test` address and submit a synthetic enquiry.
The sample owner can view it in the sample Admin and the regular account gets
403. For repeatable checks, run the probe below as an operator. It uses the
system trust store and saves its sample sessions in a private proof file.

```sh
proof_dir=$(mktemp -d)
sudo env BAPX_SAMPLE_OWNER_FILE=/etc/bapx-agency/sample-owner-password \
  node deploy/app-sample/probe.mjs seed "$proof_dir/proof.json" FULL_MAIN_SHA
# After the approved sample restart or redeploy:
sudo node deploy/app-sample/probe.mjs reopen "$proof_dir/proof.json" FULL_MAIN_SHA
```
