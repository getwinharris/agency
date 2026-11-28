# Operator-published sandbox sites

Agency can publish a built static site from the workspace assigned to an
operator-approved hostname. The source belongs to
`users/<account>/<business>/projects/<project>/dist/`. Core previews continue
to support temporary, paired localhost development. A published site serves
an immutable copy with its own HTTPS origin.

## Publish and serve

The host operator approves the account, business, and project. The pilot uses
the fixed label `sandbox-check`. Its first successful release assigns the
label to that project and subsequent releases enforce the same assignment.

The build runs in the sandbox. Its output must have an `index.html`, contain
only regular files and directories, and use visible ASCII path components
with letters, digits, dots, hyphens, or underscores. A release accepts up to
8,192 entries and 128 MiB, including up to 32 MiB per file.

The publisher opens each source relative to a held directory descriptor and
copies from the verified file inode. It refuses symlinks, multiply linked
files, special files, oversized outputs, and file or directory changes
observed during copying. Finish the build before publishing. The staging step
creates a protected copy outside the workspace before Docker opens the mount
source. The one-shot publisher runs with network disabled and a read-only
container filesystem. It reads that copy and writes complete revisions to the
named release volume. The active pointer changes atomically.
Asset requests use the active revision. If a release removes an asset that an
older open page still needs, reload the page to load the current release.

The public Rust service mounts the release store read-only. It handles app
hosts before first-party API routing. Published files support GET and HEAD
with content types and revalidation. Unpublished hosts and paths return 404.
Use a trailing slash for directory index URLs, such as `/about/`.
Traefik strips Cookie and Authorization on the pilot host. Admin keeps its
host-only session cookie.

## Inspect an approved release

From the operator's release environment, run the Core command with the
read-only publication store path and the same approved identifiers used to
publish the site:

```sh
bapx-core publish-site status RELEASE_ROOT SLUG ACCOUNT BUSINESS PROJECT
```

The command reports the selected immutable snapshot and its assigned HTTPS
URL or that no snapshot is present. It rejects mismatched ownership and
incomplete release metadata without changing the store. The output does not
confirm DNS, TLS, routing, or public reachability. Verify those separately.

## One exact-host pilot

Hostinger DNS points `app.bapx.in` and its wildcard to the VPS. The Compose
override routes the exact host `sandbox-check.app.bapx.in` to the existing
Let's Encrypt HTTP-01 resolver. Its documents return 404 until the operator
publishes the first release. Use the [deployment instructions](../../deploy/README.md#publish-the-sandbox-pilot).

A wildcard certificate uses DNS-01 or supplied certificate material.
[Let's Encrypt challenge types](https://letsencrypt.org/docs/challenge-types/)

Tenant-controlled publishing requires account-to-project authorization and
slug allocation. Retain and prune pilot revisions under operator storage
policy.
