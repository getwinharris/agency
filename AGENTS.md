# Cloudroom

- `core/`: the Rust core. Keep one Rust package and one service; apps call its API. From `core/`, run `cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings`, and `cargo test --locked --all-targets`.
- `gui/`: the desktop app, built on BB. Build and checks: [gui/README.md](gui/README.md).
- `gui/apps/www/`: bapX landing, documentation, and MediaHub. Build with `pnpm build:web` from `gui/` using Node.js 24. Serve the static output and brief API with `cloudroom serve-web` from the existing Rust package.
- `deploy/`: public web image and deployment contract. Keep its data mount private and its listener separate from native Core.
- `skills/`: built-in skills the app gives every agent.
- Keep credentials and internal notes in ignored files. Keep upstream license notices.
