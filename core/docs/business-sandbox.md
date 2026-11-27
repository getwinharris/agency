# Business workspace sandbox pilot

Issue #46 owns the account, business, project, and Linux execution boundary.
`cloudroom serve-business-sandbox POLICY.json` is an opt-in runner for a
disposable Linux worker. It starts a loopback HTTP server and uses a local
Docker engine. The public web and the single-user private Core keep their own
routers.

## Operator policy

Use a private policy file owned by the service user. Assign stable lowercase
IDs to the installation, accounts, businesses, and projects. Keep the
installation ID unique on the worker. Generate a random 32-byte token for
each account and encode it as 64 lowercase hexadecimal digits. Store the
SHA-256 of those 64 ASCII characters in the policy and keep the actual tokens
outside it. Use an immutable ID for a local image. The fixture uses the
existing Node 24 Alpine Linux base, which has a user at UID 1000 and a
directory owned by that user at `/home/node`.

```json
{
  "settings": {
    "installation": "example-disposable-worker",
    "listen": "127.0.0.1:9845",
    "image": "sha256:<64 hexadecimal digits>",
    "docker_socket": "/var/run/docker.sock"
  },
  "accounts": { "account-1": "<64 hexadecimal digits>" },
  "businesses": {
    "business-1": {
      "members": ["account-1"],
      "projects": { "project-1": { "members": ["account-1"] } }
    }
  }
}
```

Send a bearer token and a JSON object containing `argv` to
`POST /v1/businesses/{business}/projects/{project}/run` on worker loopback.
The server resolves the account before selecting a volume. It requires a
grant at both levels and returns the same 404 for an unknown or inaccessible
project. Replace the file atomically to apply account or grant changes.
Restart the service to change worker settings.

## Storage and execution

- Jobs share an immutable Linux image and run as non-root with a read-only
  root filesystem, dropped capabilities, no network, private IPC, and CPU,
  memory, process, and execution time limits.
- The installation, business, and project IDs select one durable volume at
  `/home/node`. Jobs can write to their own project volume. Core rejects
  images that declare other volumes and checks the driver, options, and
  labels of the selected volume. Scratch is a separate bounded
  `/tmp` tmpfs for each job.
- The job receives a fixed PATH, temporary HOME, and temporary directory.
  Account tokens, operator environment variables, Docker sockets, and
  provider credential stores stay outside the job. Keep credentials out of
  command arguments and shared files, which are visible to the worker
  operator and other granted project jobs.
- The controller admits two concurrent jobs. A job finishes or times out
  after 45 seconds of execution. The controller removes the container and
  preserves the volume. Forced controller shutdown can leave containers
  identifiable by their installation label.
- The controller checks the credential and both grants before starting a job,
  once per second during execution, and before returning output.
  Removing a grant, rotating the credential, or making the policy unreadable
  cancels a job whose next check observes the change. The controller removes
  its container, discards its output, and returns the same 404 used for an
  inaccessible project. Files the job already wrote remain in the volume.

## Approve a native workspace

The native access policy associates a bapX member UUID with an existing
business, project and dedicated private Core. Keep this policy separate from the
worker's one-shot job policy. Store it in a service-owned file with mode
`0600` inside a directory writable only by its owner. The directory path
must have no symlinks. Use directories owned by root or the service user,
with group and other writes disabled except at sticky ancestors such as
`/var/tmp`. Replace the file atomically when removing or changing a grant.

The policy has `version: 1` and a `projects` array. Each project has
`business_id`, `project_id`, `core_id`, `core_origin`, `workspace_id`, and
`members` containing the UUID of the single member assigned to the dedicated
Core. Use an empty `members` array to revoke workspace selection and new device
enrollment. To revoke already issued credentials, also remove the corresponding
grants from that private Core's device registry. The Core ID can be at most 63
characters to match `CLOUDROOM_INSTANCE`. The Core origin must be HTTPS, and the
reserved workspace IDs `root` and `legacy` cannot be granted. Each
business/project pair and each dedicated Core have one policy row.
Validate the file offline as the service owner with
`bapx-core check-workspace-access POLICY.json`. The command never reaches the
Core or reads a provider credential.

A member can resolve only an explicitly granted project. Automatic device
enrollment can use the member's single granted project. If the member has
several grants, project selection has to precede enrollment. Publishing this
policy parser does not activate hosted workspace execution. Follow
[#85](https://github.com/getwinharris/agency/issues/85) for the native device
issuer and production acceptance.

## Verification and scope

Run `cargo build --locked`, make the test image available on a disposable
Docker worker, and run `python3 tests/business_sandbox_e2e.py --disposable`
from `core/`. The fixture checks concurrent writes by two accounts, denied
access to unrelated projects, active-job cleanup after revocation, durable
files after restart, and fresh scratch. It removes resources for its
installation label.

Hosted onboarding and membership management, per-user provider credentials,
native agent sessions and their terminal and browser interfaces, project disk
quotas, and customer app publication need production
integration and verification. Use a dedicated worker with storage limits
before accepting customer workloads. This pilot is only exposed on loopback.
