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

Failed checks restore and verify the previously healthy image and its routing configuration. On the first placement, a failure removes the new service. A confirmed rollback skips the failed workflow attempt on subsequent checks. Rerun the workflow after correcting the cause. A failed rollback is logged and remains eligible for recovery. Retain the previous image locally. To pause deployment, stop the timer. The web data volume persists across image replacement.

Sign in to Admin as `operator` to view MediaHub inquiries and publish changes to its homepage. The web data volume contains briefs, operator notes, and published copy. Keep backups private because these include contact details and consent.
