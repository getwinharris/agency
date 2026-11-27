# bapX Agency Workspace

Agency is `getwinharris/agency`, the Cloudroom-derived source for bapX Agents and
the first-party bapX sites.

## Workspace contracts

- Read this file and any applicable child `AGENTS.md` before changing files.
  Recheck the instructions for changed paths after implementation.
- This is the canonical repository-wide agent policy. If a change alters shared
  instructions or release mechanics, update this file and the affected docs,
  child instructions, and tests in the same reviewed PR. Reconcile conflicting
  guidance and verify the resulting behavior. Propose lessons from completed
  work as reviewable edits; do not silently rewrite agent instructions.
- Keep Agency at the workspace root. Search `docs/project-index.json` for the
  exact host, guide, or source path. Use `map.mmd` for wiring and follow the
  pointer to the owning source. Verify live behavior separately.
- Stage added or removed inventory inputs, run `bash scripts/generate-map.sh`,
  and commit both generated files with the source changes. Run
  `bash scripts/generate-map.sh --check` before review. Source inventory checks
  every PR. Public web repeats the check on the release revision.
- Keep customer projects under `users/<username>/<business-slug>/projects/<project-slug>/`.
  On a host with customer workspaces, read its local `OKF.md` for the workspace
  contract. Preserve customer workspaces and operational data through source or
  deployment cleanup.
- Keep credentials, runtime data, and VPS-specific configuration outside the
  source checkout. Keep private agent notes in ignored `AGENTS.local.md` and
  consult them when working on the host. Keep this tracked `AGENTS.md` portable
  and free of machine-specific details. Git continues to track edits to this
  file even when local agent files are ignored.
- `.agents/skills/<name>/SKILL.md` is the native Codex path for locally installed
  skills. `.claude/skills` links to it for Claude compatibility. Track portable
  Agency skills in `skills/`.

**Always use relevant repository skills.** Before starting each task, check the
tracked `skills/` catalog and identify any skills whose scope matches the work.
Read each matching `SKILL.md` and apply its relevant steps during implementation,
review, and verification. Do not substitute a generic workflow for an applicable
repository skill. In the issue or PR checkpoint, or the task handoff when there
is no GitHub record, name the skills applied and briefly say what they informed.
If none match, say so. If a matching skill cannot be applied, record the actual
blocker and the safe fallback used.

## Agency source and development

- `core/` owns the Rust Core, public web mode, and persistent first-party APIs.
  Use `cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings`,
  and `cargo test --locked --all-targets` for relevant Core changes.
- `gui/apps/www/` owns the landing page, docs, MediaHub and Admin assets.
  Build with `pnpm build:web` from `gui/` using Node.js 24. The Rust
  `bapx-core serve-web` process in the public image serves the output and API.
- `gui/apps/www/src/docs/` owns the Docs navigation, Markdown renderer, and
  list of published Markdown sources. Edit guides at their source, preserve
  public slugs and heading anchors, and ensure the web image and workflow
  path filters cover the published sources.
- `gui/apps/desktop/` owns the macOS, Windows, and Linux packages. Follow the desktop
  packaging docs for versions, signing, validated downloads, and updates.
  Keep upstream license notices and compatible native protocols.
- Build signed Apple Silicon release candidates with `dist:mac:release` at the
  approved version and full source SHA. Keep candidate artifacts private until
  ordinary Gatekeeper, isolated install, and the release workflow checks in the
  [desktop packaging guide](gui/apps/desktop/README.md#build-an-apple-silicon-release-candidate) pass.
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

- `bapx.in` and its `www.bapx.in` alias serve the product landing and privacy policy.
- `app.bapx.in` opens the shared bapX account window on the apex. Treat only
  this exact hostname as first-party and keep customer subdomains separate.
- `docs.bapx.in` explains the app and private Core setup.
- `mediahub.bapx.in` is the agency's creative and technical services, portfolio,
  and project brief form. Scope every engagement individually in INR. Store
  accepted briefs in private persistent storage and use
  `bapxmediahub@gmail.com` for public business contact.
- The first-party surfaces share the bapX account service and sign-in page on
  `bapx.in`. App, MediaHub and Docs belong to the same first-party release.
  Site management is an Admin menu in the signed-in account window. Enforce
  operator roles in Rust and keep the session cookie host-only. Preserve the
  existing `admin.bapx.in` operator access during the migration. A separate
  routing change requires live acceptance of the in-window replacement.
- Public web runs separately from the native coding Core. Verify that the
  public router exposes no agent execution endpoints.

## Agent change and delivery workflow

Carry an ordinary first-party change through the applicable steps below in one
continuous run, without waiting for another prompt between implementation,
testing, review, merge, and automatic deployment. Do not bypass approvals or
required checks. For a web change, confirm the served SHA and exercise the
changed behavior in a real browser before calling it shipped. An open PR,
green CI, a diagnostics report, an isolated smoke test, or a completed agent
turn is not completion. Meet all agreed acceptance criteria for the in-scope
user journey in production. Small increments are fine; a minimal demo is
not the final deliverable. Fix recoverable blockers and keep independent
work moving when an external dependency requires owner action. If a gate cannot be
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

Before implementation, record a verifiable goal on the issue or PR. Include the
outcome, scope, validation commands, and stop condition. When asked to set an
active goal, use the client goal feature if it is available. Keep the issue or
PR checkpoint current with the current branch and SHA, the last verified
result, and the next action and owner.

Treat CI, review, and deployment waits as part of the same issue cycle. Follow
each pending check through its result, address actionable failures, and repeat
verification on the updated revision. When a cycle spans agent turns, resume
the same issue and PR from the recorded checkpoint. After verification, refresh
the queue and continue with the next ready issue. Honor a request to pause or a
stop condition set for the run.

Name the release owner and an independent browser verifier on the PR before a
web merge. Once merged, record the merge SHA, Public web run and attempt, last
observed live SHA, and next verification action. The release owner follows that
run while it is queued or running. Record any handoff and who accepted it on
the PR. Distinguish queued, deployed pending QA, verified, blocked, and
superseded releases.

1. **Recover context.** Read the relevant instructions, issue or existing PR,
   and latest main and PR revisions. Trace the owning source, route, build
   output, and runtime in the map. Search with `rg` before adding a new owner.
   Recover the active goal, branch, exact SHA, latest verification evidence,
   and outstanding blocker from the PR or handoff. Preserve other worktrees
   and customer data; resume the existing branch rather than duplicating it.
2. **Implement a scoped change.** Reuse the owning component and existing
   deployment path. Define the user-visible acceptance criteria and record the
   checks needed for the affected behavior. In every cycle, review the affected
   documentation, release timeline, and changelog. Update affected guides,
   the changelog, and any pending availability entries in the same PR. Add a
   dated verified release entry after live acceptance.
   Follow the existing version policy and record the version or tag where it
   applies. Record why if no docs, changelog, or version update is warranted;
   do not invent a version bump or mark pending work as shipped.
3. **Verify before merge.** Run builds and focused regression tests on the
   actual change. Every engineering loop must include actual browser
   verification. Use Ego on relevant viewports for affected UI flows; for
   backend-only changes, run a relevant browser smoke test. Use an authorized
   browser environment. If the VPS cannot run it, serialize or retry within its
   capacity, or use a separately approved runner. Access to another device
   requires permission. Check timing, permissions, and failure paths where
   applicable. Record the exact tested
   PR head, checks run, and anything skipped or blocked. Read all review
   summaries and inline comments; fix and retest valid findings. Explain
   inapplicable findings and get reviewer agreement or explicit maintainer
   approval before resolving them. Reply in each actionable review thread
   with the fix commit and specific retest evidence, or the agreed reason for
   not changing it. Recheck required CI and QA on the final head, carrying
   forward unchanged evidence only where it still applies. Verify Source
   inventory and each workflow whose trigger covers the changed paths. Record
   intentionally skipped jobs with the reason. A skipped applicable job
   without a recorded justification leaves the gate open. Apply the policy
   even when GitHub allows a merge without enforcing its gates.
4. **Merge, deploy, and verify.** Merge only when required reviews, checks,
   and approvals pass. Follow the existing automatic main deployment for web
   changes. After the exact merge SHA is live, a verifier separate from the
   implementer must exercise the affected flow on the public URL in a browser.
   Record the verifier, UTC timestamp or time zone, PR head, merge and served
   SHA, workflow run and attempt, URL, viewport, and concrete results on the
   PR. If browser access is blocked, record the blocker and leave acceptance
   pending. Follow the rollback procedure for a confirmed production failure.
5. **Leave a reproducible handoff.** Before pausing or stopping, record the
   exact tested commit, repeatable test steps, concrete browser results, and
   (if released) the served SHA and live links. Name the next action and who
   owns it. Keep transient status in the PR or handoff, not in this file.
6. **Verify downloads separately.** Track Linux, macOS, Windows, and the
   Android APK individually for the approved version. Test the Linux installer
   on the VPS first, from the actual download, and verify install and launch.
   Linux success does not verify another platform. Before announcing any
   platform, verify its public download, checksum, applicable signing and
   update checks, install and launch, and the agreed end-to-end workflow on
   that platform (including signup and real agent tasks when in scope). Mark missing or
   unverified packages explicitly. A successful build is not a public release.

## Web release verification

- Before merging a web release, verify that required CI passed and independent
  QA signed off on the exact PR head. Confirm the PR is eligible and blocking
  findings are resolved. Recheck after any push. After automatic deployment,
  record separate independent browser acceptance on the exact served merge.
- GitHub Actions starts the Hostinger deployment for a push to `main` after
  required checks complete and the exact revision's verified image and release
  manifest are published. Include changes to shared code, build inputs, and
  deployment configuration. Keep production deployment event-driven and verify
  the exact served revision and rollback image on each release.
- Ship the first-party web hosts together as one Rust Core release. The landing,
  App entry, Docs, MediaHub, and Admin assets are part of the exact `main` image, not
  independently deployed sites or SPAs. Identify the image by its immutable
  digest, record its Git SHA, and keep the previous healthy image for rollback.
- Verify the same exact `main` SHA on `bapx.in`, `www.bapx.in`, `docs.bapx.in`,
  `mediahub.bapx.in`, `admin.bapx.in`, `app.bapx.in`, and any additional
  first-party hosts explicitly configured for that release. Run HTTPS smoke checks on each host
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
- Restore the previous healthy release on a confirmed post-deploy failure.
  Follow the [recovery procedure](deploy/README.md#recover-a-missed-main-run)
  when only browser acceptance fails. Report the PR, deployed SHA, workflow run,
  and verified live URLs. Completion requires the live revision, smoke checks,
  and independent browser acceptance for the in-scope user journey.
