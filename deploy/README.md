# Agency web deployment

The [Public web Actions workflow](https://github.com/getwinharris/agency/actions/workflows/web.yml) builds and tests pull requests that change web inputs. Every push to `main` calls the existing App and Core checks on that revision before building, smoke testing, and publishing `ghcr.io/getwinharris/agency-web:<commit>`. The web job uploads the immutable image digest, revision, and checksummed Compose configuration as `agency-web-release`.

The downstream `deploy` job connects to Hostinger using pinned SSH and passes the exact `main` SHA, run ID, and run attempt. Main pushes share one concurrency group with `queue: max`. The VPS verifies the successful App, Core, and web jobs for that run, checks that the candidate is in `main` history and advances the deployed revision, and downloads the matching release artifact. After verifying the digest, OCI revision, and Compose checksum, it updates only `agency-web`. Compose settings ship with the verified commit.

The PR names a release owner and a browser verifier separate from the
implementer. The owner records the merge SHA, run and attempt, and last observed
live SHA on the PR. Follow the exact run while queued or running. Record who
accepts any handoff. When a newer deployment supersedes the target, record that
state and verify the new revision separately.

## Recover a missed main run

1. Read the current `main` SHA and find the exact `push` run in [Public web](https://github.com/getwinharris/agency/actions/workflows/web.yml). Follow a queued or running attempt. For a failed App, Core, web or deploy job, inspect its log and rerun after a transient issue clears. A deploy-only rerun may reuse the successful upstream jobs and release artifact from the same run and SHA. If the artifact has expired, rerun all jobs. Changes to source or workflow code go through a new PR.
2. If there is no run, check the repository’s [Actions tab](https://github.com/getwinharris/agency/actions). A maintainer can re-enable Actions if GitHub has paused the fork. Recheck the current SHA before taking further action. If the push still has no run to rerun, merge the next eligible PR through GitHub with green CI, independent QA on its exact head, and all blocking reviews resolved. Its new `main` SHA becomes the release candidate.
3. For a failed deployment, inspect the `deploy` job and the matching `bapx-agency-web-release-<run>-<attempt>-<pid>.service` in the VPS journal. Check the recorded rollback before retrying. If a newer release has already deployed, verify that release and leave the older attempt superseded. Use the [verified release checks](#record-a-verified-release) after the deploy job succeeds.
4. If independent browser QA finds a confirmed regression after HTTP checks
   passed, record the live SHA, browser evidence, previous verified digest, and
   recovery owner on the PR. The release owner coordinates recovery with an
   authorized maintainer. Use the approved previous-image recovery if
   available, or a reviewed revert through the normal main workflow to restore
   the last healthy behavior. An older run cannot replace a newer live SHA.
   Keep acceptance pending until the recovery passes HTTPS and browser checks.

## Set up the Hostinger deployment

Use the approved Agency checkout on Hostinger. The local `AGENTS.local.md` records the VPS working directory. Identify the existing Traefik Compose project name and its absolute project directory. These values control which deployment, network, and volumes the driver can use. The base Compose file is `docker-compose.yml` in that directory. The driver requires systemd, OpenSSH, sudo, Docker Compose, `curl`, `jq`, `flock`, and a host GitHub CLI credential with read access to Actions artifacts. A private image also requires package read access. The driver keeps temporary registry credentials separate from the host Docker configuration.

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

Set `/etc/bapx-agency/web-deploy.conf` to mode `0600` and ownership `root:root`. Replace both sample values with those of the existing proxy implementation.

```ini
project_name=existing-proxy
project_dir=/absolute/path/to/existing/traefik-project
```

Install the reviewed scripts and scoped sudo rule from the approved revision.

```sh
sudo install -d -o root -g root -m 0755 /usr/local/libexec
sudo install -o root -g root -m 0755 deploy/deploy-web.sh /usr/local/libexec/bapx-agency-web-deploy-action
sudo install -o root -g root -m 0755 deploy/deploy-web-ssh.sh /usr/local/libexec/bapx-agency-web-ssh
sudo visudo -cf deploy/web-deploy.sudoers
sudo install -o root -g root -m 0440 deploy/web-deploy.sudoers /etc/sudoers.d/bapx-web-deploy
sudo visudo -c
```

Create the dedicated `bapx-web-deploy` system account with a locked password, a shell for the forced command, and no Docker group membership. Keep the account's home and `.ssh` directories root-owned and readable by SSH. Set `.ssh` to mode `0755` and `authorized_keys` to `0644`. Generate a dedicated production key pair and install its public key as a single `authorized_keys` entry with this prefix.

```text
restrict,command="/usr/bin/sudo -n /usr/local/libexec/bapx-agency-web-ssh"
```

Create the GitHub Actions environment `public-web-production` and restrict its deployment branch policy to `main`. Set its `VPS_SSH_HOST`, `VPS_SSH_KNOWN_HOSTS`, and `VPS_SSH_PRIVATE_KEY` secrets. Pin the host's public SSH key from a trusted VPS console. The known-hosts entry must use the same DNS name as `VPS_SSH_HOST`. The private key is the dedicated deployment key. Keep these values out of the repository and logs.

Preflight pinned SSH as the deployment account with the incomplete command `deploy-web`. The wrapper must print `Expected a Public web release SHA, run ID, and attempt.` and exit with status 2. A valid command starts a transient root-owned systemd service for a valid release. This keeps the deployment running to verification or rollback even if its SSH connection drops. The action driver uses the same release lock as the legacy timer during an existing host's migration.

On an existing installation, leave the legacy timer active until the first direct deploy job succeeds and the [release verification](#record-a-verified-release) passes, including public HTTPS revision checks and browser acceptance. Confirm the direct deployment in GitHub and the transient unit's journal. Then retire the legacy timer and units.

```sh
sudo systemctl disable --now bapx-agency-web-deploy.timer
sudo systemctl stop bapx-agency-web-deploy.service
sudo unlink /etc/systemd/system/bapx-agency-web-deploy.timer
sudo unlink /etc/systemd/system/bapx-agency-web-deploy.service
sudo systemctl daemon-reload
```

Record that the old timer and service are absent from `systemctl list-unit-files` and the timer is absent from `systemctl list-timers --all`. Keep the release receipt, verified image, Compose snapshots, and data volumes in place. Changes to the installed scripts require review and installation from the approved revision. Use the next eligible `main` push to verify the automatic deployment path.

The deployment checks the container by digest and tests `bapx.in`, `www.bapx.in`, `docs.bapx.in`, `mediahub.bapx.in`, `admin.bapx.in`, and `app.bapx.in` through the local TLS proxy before saving `/var/lib/bapx-agency-web-deploy/last-good.json`. Each host’s `/healthz` must report the release commit. Both landing hostnames must serve the page with its `headline` heading ID. Public web CI also checks the server-rendered walkthrough and FAQ on both homepages. The Admin session endpoint must require sign-in. The state file records the run, `main` SHA, deployed digest, Compose checksum, and previous image.

App uses a dedicated HTTPS router on the shared service. Its root returns a
temporary redirect to `https://bapx.in/account/`, and its health endpoint reports
the same commit as the apex. Before the first App release, install the reviewed
driver revision that checks that redirect and allows time for Traefik to issue
the certificate. It checks App whenever the active Compose snapshot contains
the App rule, so a rollback to an earlier five-host snapshot still verifies.

Failed checks restore and verify the previously healthy image and its routing configuration. On the first placement, a failed deployment removes the new service. Retain the previous image locally and consult the VPS journal if rollback needs recovery. The web data volume persists across image replacement.

Sign in to Admin as `operator` to view MediaHub inquiries and publish changes to its homepage. The web data volume contains briefs, operator notes, and published copy. Keep backups private because these include contact details and consent.

## Verify the shared bapX account flow

The public image serves the shared account window from `bapx.in`. Operators
manage the site through its Admin menu. The proxy forwards the host-only
session cookie on the apex account and operator API routes. Public content and
customer sites retain their existing request isolation. The account registry
and invitations use the service's private data volume. Browser sessions expire
on service restart, and a user can sign in again with the same identity. The
existing `admin.bapx.in` entry and operator credential remain available during
migration. The enabled image fails startup if it cannot read the account
registry, so a failed account-store check follows the normal rollback path.

Use a disposable account on an approved test deployment. Sign in through the
apex page as an authorized operator, open Admin in the same window, and issue an
invitation for a test address. Open the invitation in a fresh browser profile,
set a password, and confirm that the same sign-in page recognizes the account
after signing out. The signed-in member sees the account page without an Admin
menu. The Admin API must return HTTP 403 to the member and HTTP 401 to a signed
out browser. Confirm that reusing an invitation fails and that an unrecognized
return URL stays on the account page. Check the existing operator access without
changing live MediaHub records.

Invitation signup establishes a bapX identity. Workspace grants and native
device enrollment require the authorized sandbox path tracked in
[#46](https://github.com/getwinharris/agency/issues/46) and
[#85](https://github.com/getwinharris/agency/issues/85).

## Record a verified release

Use [release notes](../gui/docs/release-notes.md) for the public changes and their verification evidence. The desktop product version comes from [`gui/apps/desktop/package.json`](../gui/apps/desktop/package.json) at the deployed commit. Web releases have their own cadence and use the full `main` SHA as their revision.

1. From the successful `Public web` run for the exact released `main` SHA, read `release.json` in the `agency-web-release` artifact. Confirm the SHA and immutable image digest match the Hostinger `last-good.json` receipt and the image's OCI revision label. Match the run and attempt to the `deploy` job and the VPS journal.
2. From the exact release checkout, run the same smoke checks as Public web CI
   over HTTPS with `./gui/apps/cli/bin/bapx-cli repo verify web --revision SHA --live`.
   Exercise the changed behavior in a browser. The independent verifier uses
   an authorized browser to exercise it separately and records the
   URL, viewport, exact served SHA, and result on the PR. Check the Admin
   sign-in page and signed-out HTTP 401 from `GET /api/admin/session` without
   changing production data. Confirm the previous healthy image remains
   available. Leave acceptance pending if browser capacity or permission blocks
   the check. Follow rollback for a confirmed production regression.
3. Add the verified release as a new dated entry before the older web deployments in the release notes. Record the verification time and time zone, desktop source version, full SHA, image digest, workflow run and attempt, and user-facing changes. Link the merge PR, successful run, and public pages. Keep the verification snapshot in the notes while the health endpoint follows the current deployment and the workflow artifact expires.
4. Keep open PRs, local tests, staging runs, and public availability gaps under
   Pending. The dated entry can follow in a reviewed evidence-only PR once
   independent production acceptance passes. Verify that the entry renders
   after its automatic rollout. The evidence-only rollout needs no duplicate
   product release entry. Verify desktop downloads and update channels separately.

## Publish the sandbox pilot

After the web release includes the exact pilot route and read-only release volume, approve one project under the [workspace layout](../core/docs/sites.md). Run the project's build in its own sandbox and have it produce `dist/index.html` and any standalone assets. Check that all output can be made public.

From the Agency checkout on Hostinger, replace the three labels with the approved project identifiers.

```sh
sudo bash deploy/publish-site.sh ACCOUNT BUSINESS PROJECT
```

The helper uses the verified web image from the deployment record. The native `cloudroom publish-site stage` command copies the approved build into an operator-private directory. Then `cloudroom publish-site release` runs once in the same image with a read-only snapshot and the writable `agency-web-sites` volume of the proxy's Compose project. The web service reads this separate volume at `/var/lib/bapx-sites`. The first release binds the label to the approved project. Run the same command for its next build.

Check the certificate, index, and representative asset at [sandbox-check.app.bapx.in](https://sandbox-check.app.bapx.in/). Check that traversal attempts, `/healthz`, and `/api/admin/session` return 404 there and that the Admin host still requires authentication. Verify that a different hostname receives no project content. Use the configured first-party hosts for release revision checks. Preserve the site release volume on deployment and keep its backups private.

## Agency checkout script inventory

Compared with Cloudroom commit `501f5123cb8e25097040ffb164d4bfdd205f929f`,
Agency added six tracked shell scripts. The inventory generator moved to
`./gui/apps/cli/bin/bapx-cli repo inventory`. The workflow loads the checked-in
Compose configuration without talking to the Docker daemon.

| Agency-added script | Disposition |
| --- | --- |
| `scripts/generate-map.sh` | Replaced by `repo inventory generate`, `check`, `map`, and `index`. |
| `deploy/deploy-web-ssh.sh` | Keep the restricted SSH entry point. It validates the request and hands off to a systemd job through the existing sudoers rule. |
| `deploy/deploy-web.sh` | Keep the host-only rollout driver. It verifies the manifest, Compose checksum and image digest, serializes rollouts, runs HTTPS checks, and restores the previous healthy release on failure. |
| `deploy/publish-site.sh` | Keep the operator wrapper. It selects the verified web image and the operator-owned volume. Rust already implements the stage and release operations. |
| `gui/apps/desktop/scripts/verify-macos-release.sh` | Keep the release verifier on the signing Mac. It runs the platform's signature, notarization, and Gatekeeper checks. |
| `core/tests/claude_login_fixture.sh` | Keep the executable test fixture. Core CI invokes it as a substitute for the provider login process. |

Checkout inventory commands are separate from the installed agent CLI and the
business sandbox API. Operator scripts are installed on the release host.
Customer jobs run under the existing project grants in a non-root container
with a project volume and no Docker socket or network. Customer publishing
requires its own authorized product flow.
