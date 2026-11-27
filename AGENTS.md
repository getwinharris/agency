# bapX VPS Workspace

`/root/bapx.in` is the Agency Git checkout and the VPS workspace. Agency is
`getwinharris/agency`, the Cloudroom-derived source for bapX Agents and the
first-party bapX sites.

## Workspace contracts

- Read this file and any applicable child `AGENTS.md` before changing files.
  Recheck the instructions for changed paths after implementation.
- This is the canonical repository-wide agent policy. If a change alters shared
  instructions or release mechanics, update this file and the affected docs,
  child instructions, and tests in the same reviewed PR. Reconcile conflicting
  guidance and verify the resulting behavior. Propose lessons from completed
  work as reviewable edits; do not silently rewrite agent instructions.
- Keep Agency at the workspace root. Use `map.mmd` to trace ownership, route,
  deployment, and data boundaries.
- Keep customer projects under `users/<username>/<business-slug>/projects/<project-slug>/`.
  Read `OKF.md` for the user and project workspace contract. Preserve customer
  workspaces and operational data through source or deployment cleanup.
- Keep credentials, runtime data, VPS configuration, and locally installed
  skills outside commits. `.agents/skills/<name>/SKILL.md` is the native Codex
  project path, and `.claude/skills` links to it for Claude compatibility.
  Agency's bundled skills live in `skills/`.

## Agency source and development

- `core/` owns the Rust Core, public web mode, and persistent first-party APIs.
  Use `cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings`,
  and `cargo test --locked --all-targets` for relevant Core changes.
- `gui/apps/www/` owns the landing page, docs, MediaHub and Admin assets.
  Build with `pnpm build:web` from `gui/` using Node.js 24. The Rust
  `cloudroom serve-web` process serves the output and API.
- `gui/apps/www/src/docs/` owns the Docs navigation, Markdown renderer, and
  list of published Markdown sources. Edit guides at their source, preserve
  public slugs and heading anchors, and ensure the web image and workflow
  path filters cover the published sources.
- `gui/apps/desktop/` owns the macOS, Windows, and Linux packages. Follow the desktop
  packaging docs for versions, signing, validated downloads, and updates.
  Keep upstream license notices and compatible native protocols.
- For App CI, use the Node version in `gui/.nvmrc`, the pnpm version in
  `gui/package.json`, and the Bun version in the App workflow.
- Ship portable agent workflows as Agent Skills and callable tool interfaces
  through MCP. Verify native discovery in the clients listed in
  `gui/docs/configuration.md`. Desktop UI extensions use the Agency plugin runtime.
- `deploy/` owns the public web image and VPS deployment instructions.
  Web deployments use the verified image from `main`.

## First-party runtime and customer deployments

- Run first-party bapX services on Rust Core. Use Python only for a specific
  need that is documented and reviewed. TypeScript and JavaScript may be
  compiled to browser assets; they do not imply a Node.js server.
- Do not add new first-party Node.js dependencies or bundle, publish, or deploy
  a Node.js runtime for bapX. Identify existing Node-based build and test
  tooling explicitly and track its removal separately; do not claim it is
  gone or break the current build by removing it without a tested replacement.
- Customers may build and test Node.js bundles for their own apps and deploy
  them independently. A supported deployment-only capability may publish
  those apps separately; that does not make Node.js part of the bapX runtime.
  Mark a deployment target unverified until its real publish path is tested.

## Public and private surfaces

- `bapx.in` is the product landing and privacy policy.
- `docs.bapx.in` explains the app and private Core setup.
- `mediahub.bapx.in` is the agency's creative and technical services, portfolio,
  and project brief form. Scope every engagement individually in INR. Store
  accepted briefs in private persistent storage and use
  `bapxmediahub@gmail.com` for public business contact.
- `admin.bapx.in` is the private operator surface. Keep MediaHub briefs,
  permissions, and published content under authenticated API controls.
- Public web runs separately from the native coding Core. Verify that the
  public router exposes no agent execution endpoints.

## Agent change and delivery workflow

Carry an ordinary first-party change through the applicable steps below in one
continuous run, without waiting for another prompt between implementation,
testing, review, merge, and automatic deployment. Do not bypass approvals or
required checks. For a web change, confirm the served SHA and exercise the
changed behavior in a real browser before calling it shipped. An open PR,
green CI, or a completed agent turn is not completion. If a gate cannot be
cleared, leave a concise handoff with the exact blocker, evidence, and next
safe action; report non-deploying changes according to their actual scope.

**Use GitHub issues as the work queue.** At the start of an engineering run,
review open issues and active PRs. Pick a ready issue, reuse any existing PR,
and record a short plan, scope, and browser acceptance checks in the issue or
PR. When scope and permissions are clear, own the work through review, CI,
merge, and live verification, then select the next ready issue instead of
waiting for a new prompt. Do not duplicate active work or bypass release gates.
Ask only when an unresolved decision, permission, or real blocker prevents safe
progress; record the blocker and continue another ready issue when appropriate.

1. **Recover context.** Read the relevant instructions, issue or existing PR,
   and latest main and PR revisions. Trace the owning source, route, build
   output, and runtime in the map. Search with `rg` before adding a new owner.
   Recover the active goal, branch, exact SHA, latest verification evidence,
   and outstanding blocker from the PR or handoff. Preserve other worktrees
   and customer data; resume the existing branch rather than duplicating it.
2. **Implement a scoped change.** Reuse the owning component and existing
   deployment path. Define the user-visible acceptance criteria and record the
   checks needed for the affected behavior. Keep docs, release instructions,
   and the changelog aligned, without marking unverified work as shipped.
3. **Verify before merge.** Run builds and focused regression tests on the
   actual change. Every engineering loop must include actual browser
   verification. Use Ego on relevant viewports for affected UI flows; for
   backend-only changes, run a relevant browser smoke test. Check timing,
   permissions, and failure paths where applicable. Record the exact tested
   PR head, checks run, and anything skipped or blocked. Read all review
   summaries and inline comments; fix and retest valid findings. Explain
   inapplicable findings and get reviewer agreement or explicit maintainer
   approval before resolving them. Reply in each actionable review thread
   with the fix commit and specific retest evidence, or the agreed reason for
   not changing it. Recheck required CI and QA on the final head, carrying
   forward unchanged evidence only where it still applies.
4. **Merge, deploy, and verify.** Merge only when required reviews, checks,
   and approvals pass. Follow the existing automatic main deployment for web
   changes. Verify both the served revision and the changed behavior at the
   real entry point in a browser; a passing CI job, merge, or staged result
   is not proof of production. Record PR, exact head and merge SHA, workflow
   run, live URL, served SHA, and concrete browser assertions. If browser
   access is blocked, report that blocker and do not claim completion. Name the failing step and next action if
   blocked. Follow the rollback procedure if live checks fail.
5. **Leave a reproducible handoff.** Before pausing or stopping, record the
   exact tested commit, repeatable test steps, concrete browser results, and
   (if released) the served SHA and live links. Name the next action and who
   owns it. Keep transient status in the PR or handoff, not in this file.
6. **Verify downloads separately.** Track Linux, macOS, Windows, and the
   Android APK individually for the approved version. Test the Linux installer
   on the VPS first, from the actual download, and verify install and launch.
   Linux success does not verify another platform. Before announcing any
   platform, verify its public download, checksum, applicable signing and
   update checks, and install and launch on that platform. Mark missing or
   unverified packages explicitly. A successful build is not a public release.

## Web release verification

- Before merging a web release, verify that required CI passed and independent QA signed off on the exact PR head. Confirm the PR is eligible to merge and all blocking review findings are resolved. Recheck after any new push.
- Use the existing CI/CD workflow so every push to `main` that affects the live web release automatically builds and deploys to Hostinger after required checks pass. Include changes to shared code, build inputs, and deployment configuration that affect the web release.
- Ship the first-party web hosts together as one Rust Core release. The landing,
  Docs, MediaHub, and Admin assets are part of the exact `main` image, not
  independently deployed sites or SPAs. Identify the image by its immutable
  digest, record its Git SHA, and keep the previous healthy image for rollback.
- Verify the same exact `main` SHA on `bapx.in`, `docs.bapx.in`,
  `mediahub.bapx.in`, `admin.bapx.in`, and any additional first-party hosts
  explicitly configured for that release. Run HTTPS smoke checks on each host
  and exercise the affected browser flows. Check Admin sign-in and require
  authentication without changing production data. Treat a host revision
  mismatch as a failed verification; record the expected and observed SHAs.
  The normal release must run after a merge without an operator starting a
  file, shell command, or manual deployment. Manual recovery is not proof of
  automatic release. Customer sites have their own deployment scope.
- Follow the [release recording steps](deploy/README.md#record-a-verified-release)
  to update the [bapX release notes](gui/docs/release-notes.md) with verified
  public changes and their evidence. Use the desktop package version for the
  product and the full `main` SHA for web deployments. Keep pending work and
  availability gaps marked in the notes.
- If a post-deploy check fails, restore the previous healthy release and report the blocker. Report the PR, deployed SHA, workflow run, and verified live URLs. The task is complete when the live revision and smoke checks pass.
