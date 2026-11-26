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
- `gui/apps/desktop/` owns the Mac and Windows installers. Follow the desktop
  packaging docs for versions, signing, validated downloads, and updates.
  Keep upstream license notices and compatible native protocols.
- For App CI, use the Node version in `gui/.nvmrc`, the pnpm version in
  `gui/package.json`, and the Bun version in the App workflow.
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
