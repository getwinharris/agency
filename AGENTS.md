# bapX VPS Workspace

`/root/bapx.in` is the Agency Git checkout and the VPS workspace. Agency is
`getwinharris/agency`, the Cloudroom-derived source for bapX Agents and the
first-party bapX sites.

## Workspace contracts

- Read this file and any applicable child `AGENTS.md` before changing files.
  Recheck the instructions for changed paths after implementation.
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

## Change and delivery workflow

1. Trace the owning source, route, build output, and runtime in the map.
   Search the existing implementation with `rg` before adding a new owner.
2. Keep associated docs, deployment instructions, and the changelog current.
   Record which checks ran and any remaining release gaps.
3. Validate UI changes in a real browser. Use Ego for viewport, navigation,
   motion, and form checks. Verify live host ownership after deployment.
4. For GitHub delivery requested by the user, use the relevant issue and
   branch, validate before committing, and put the checks and exact revision
   in the pull request. Deploy the merged revision when requested.
5. Ship versioned desktop downloads only after platform, signing, update,
   and install verification for the user-approved version.

## Web release verification

- Before merging a web release, verify that required CI passed and independent QA signed off on the exact PR head. Confirm the PR is eligible to merge and all blocking review findings are resolved. Recheck after any new push.
- Use the existing CI/CD workflow so every push to `main` that affects the live web release automatically builds and deploys to Hostinger after required checks pass. Include changes to shared code, build inputs, and deployment configuration that affect the web release.
- Deploy the image built from the exact `main` commit, identified by its immutable digest. Record the deployed Git SHA and keep the previous healthy image available for rollback.
- After deployment, verify the live revision matches the `main` commit and run HTTPS smoke checks for bapx.in, docs.bapx.in, mediahub.bapx.in, and admin.bapx.in. Check that Admin serves sign-in and requires authentication without changing production data.
- Follow the [release recording steps](deploy/README.md#record-a-verified-release)
  to update the [bapX release notes](gui/docs/release-notes.md) with verified
  public changes and their evidence. Use the desktop package version for the
  product and the full `main` SHA for web deployments. Keep pending work and
  availability gaps marked in the notes.
- If a post-deploy check fails, restore the previous healthy release and report the blocker. Report the PR, deployed SHA, workflow run, and verified live URLs. The task is complete when the live revision and smoke checks pass.
- Before merging any PR, read all review summaries and inline comments, including automated reviews. Fix every valid finding and test the fix. For a suggestion that doesn’t apply, explain why in the review thread and get reviewer agreement or explicit maintainer approval before resolving it.
- Push the fixes, reply in each thread with the fix and verification evidence, and recheck the latest PR commit. Merge only after required reviews are complete, actionable threads are resolved, and required CI passes on that exact commit. Then follow the automatic `main` deployment and live verification steps.
