# Agency web deployment

The `Public web` Actions workflow builds and tests pull requests. Its successful push runs on `main` publish `ghcr.io/getwinharris/agency-web:<commit>` with the OCI revision label. The VPS job verifies the workflow and revision, resolves the image digest, and updates only the `agency-web` service. Path-filtered pushes can leave a successful web commit behind the current tip of `main`. The job accepts that commit only while it remains in `main` history and the latest web run succeeded.

Install reviewed copies of the Compose override, host script, and systemd units under root ownership. The script uses the existing Docker Compose project at `/docker/traefik-vmm1` and shares its deployment lock with the legacy job. It requires Docker Compose, `curl`, `jq`, `flock`, and the host operator's authenticated GitHub CLI. If the registry package is private, that credential needs package read access. The job keeps temporary registry credentials separate from the host Docker configuration.

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

The deployment checks the container by digest and tests the landing, Docs, MediaHub, and Admin through the local TLS proxy before saving `/var/lib/bapx-agency-web-deploy/last-good.json`. It verifies that the Admin session endpoint requires sign-in. The state file records the run, `main` SHA, deployed digest, and previous image. Failed checks restore the last healthy image or remove the new service on its first placement. The failed workflow attempt is skipped on subsequent checks. Rerun the workflow after correcting the cause. Retain the previous image locally. To pause deployment, stop the timer. The web data volume is independent of image replacement.

Sign in to Admin as `operator` to view MediaHub inquiries and publish changes to its homepage. The web data volume contains briefs, operator notes, and published copy. Keep backups private because these include contact details and consent.
