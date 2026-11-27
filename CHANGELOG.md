# Changelog

See the [bapX release notes](gui/docs/release-notes.md) for the dated, verified web deployment timeline and current public availability.

## Unreleased

- Generate the Agency architecture map from checked-in source and verify its routes and release coverage in CI.
- Deploy verified `main` builds to Hostinger directly from the Public web workflow and preserve digest-based rollback.
- Explain the private Core setup on the homepage and show parallel worktrees and reconnecting in a sample walkthrough.
- Document how to verify the running private Core build after a restart.
- Present verified bapX web deployments as a chronological timeline in Docs.
- Add a responsive homepage menu with verified destinations and remove its GitHub link.
- Start new Cloudroom threads from the selected Git branch and preserve existing workspace edits if a checkout cannot proceed.
- Keep app Admin enquiries and account controls readable on narrow screens.
- Add an operator-run static publishing pilot for sandbox builds on sandbox-check.app.bapx.in.
- Add an opt-in app starter with site-scoped sign-in, verified signup activity, forms, and an enquiries dashboard backed by persistent project data.
- Give the app admin starter a provider-free email and password flow with salted password hashes, app-local owner provisioning, and optional verified email and Google sign-in.
- Restore the original bapX wordmark and favicon formats across all first-party websites.
- Use bapX in the homepage title and social metadata, link the wordmarks to bapX home, and restore the cursive Docs, MediaHub, and Admin suffixes.
- Guide visitors to private Core setup or a MediaHub brief with a matching service.
- Compare draft and published MediaHub copy before publishing in Admin.
- Release the Core journal lock when the writer exits, even if a starting child still holds the descriptor.
- Install and verify the portable file-tree skill in Codex, OpenCode, and Hermes.
- Gate automatic Hostinger releases on App and Core checks for the exact main revision, and verify HTTPS provenance and rollback by image digest.
- Verify the landing heading landmark and exact release revision on both bapX landing hostnames.
- Document recovery for missed Public web runs and require independent QA on the exact release PR head.
- Add bapX Agents landing and documentation on the Cloudroom fork.
- Run the public Rust image as `bapx-core` and keep the legacy executable available to existing publishing tools.
- Use bapX Agents in local App and desktop labels and repair the stable Linux AppImage share-link registration.
- Add an interactive walkthrough of local and remote Core sessions.
- Rebuild MediaHub and its seven case studies with a persistent Rust brief endpoint.
- Add an authenticated MediaHub inquiry inbox and homepage editor at Admin.
- Use the bapX violet accent for primary buttons and keyboard navigation on the Agents, Docs, and Privacy pages.
- Rebrand the macOS and Windows desktop package sources as bapX Agents v0.1.0 with an Agency update channel.
- Build and verify versioned Apple Silicon release candidates before public distribution.
- Update public contact and repository links.
- Publish developer Markdown on Docs with local navigation and a verified release changelog.
