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

## Record a verified release

Use [release notes](../gui/docs/release-notes.md) for the public changes and their verification evidence. The desktop product version comes from [`gui/apps/desktop/package.json`](../gui/apps/desktop/package.json) at the deployed commit. Web releases have their own cadence and use the full `main` SHA as their revision.

1. From the successful `Public web` run for the exact `main` SHA, read `release.json` in the `agency-web-release` artifact. Confirm the SHA and immutable image digest match the Hostinger `last-good.json` receipt and the image's OCI revision label. Check the run and attempt recorded in the receipt.
2. Confirm each public `/healthz` reports the same SHA. Verify representative HTTPS pages and Admin sign-in and session authentication with read-only requests. Confirm the previous healthy image remains available.
3. Add the verified release as a new dated entry before the older web deployments in the release notes. Record the verification time and time zone, desktop source version, full SHA, image digest, workflow run and attempt, and user-facing changes. Link the merge PR, successful run, and public pages. Keep the verification snapshot in the notes while the health endpoint follows the current deployment and the workflow artifact expires.
4. Keep open PRs, local tests, staging runs, and public availability gaps under Pending. Move changes to a verified release entry after the applicable production checks pass. Record desktop download availability after verifying the published packages and update channel separately.

## Publish the sandbox pilot

After the web release includes the exact pilot route and read-only release volume, approve one project under the [workspace layout](../core/docs/sites.md). Run the project's build in its own sandbox and have it produce `dist/index.html` and any standalone assets. Check that all output can be made public.

From the Agency checkout on Hostinger, replace the three labels with the approved project identifiers.

```sh
sudo bash deploy/publish-site.sh ACCOUNT BUSINESS PROJECT
```

The helper uses the verified web image from the deployment record. The native `cloudroom publish-site stage` command copies the approved build into an operator-private directory. Then `cloudroom publish-site release` runs once in the same image with a read-only snapshot and a writable `traefik-vmm1_agency-web-sites` volume. The web service reads this separate volume at `/var/lib/bapx-sites`. The first release binds the label to the approved project. Run the same command for its next build.

Check the certificate, index, and representative asset at [sandbox-check.app.bapx.in](https://sandbox-check.app.bapx.in/). Check that traversal attempts and `/api/admin/session` return 404 there and that the Admin host still requires authentication. Verify that a different hostname receives no project content. Use the existing four-host health checks for first-party release verification. Preserve the site release volume on deployment and keep its backups private.
