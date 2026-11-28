# Build bapX Agents from source

These instructions build a development copy. See the [release notes](docs/release-notes.md)
for public package availability and the verified web deployment history.

You need macOS on Apple Silicon, Git, Node.js 22.19+, pnpm 10.34.9, Bun 1.4.5, Python 3.11+, and Xcode Command Line Tools.

Run these from this folder:

```sh
pnpm install --frozen-lockfile
pnpm exec turbo run build typecheck --filter=@cloudroom/app --filter=@cloudroom/server --filter=@cloudroom/desktop --concurrency=2
```

SQLite, file watching, and terminals use native modules, so their install scripts must run: `pnpm-workspace.yaml` lists the allowed ones. If your pnpm version differs, use `npx --yes pnpm@10.34.9`.

Use `bapx-cli --help` after installing and launching bapX Agents. On Linux and
macOS the stable app sets up `~/.local/bin/bapx-cli`. On Windows use
`bapx-cli.cmd` or `bapx-cli.ps1` in the installed host-daemon directory.
Existing scripts can continue to use `room-cli`. For development from this
checkout, run `pnpm bapx-cli --help` from `gui/`.

## Work with repository skills

From the Agency checkout root, list the tracked skill names, read the one you
need, and explicitly update its `SKILL.md`:

```sh
./gui/apps/cli/bin/bapx-cli repo skills list
./gui/apps/cli/bin/bapx-cli repo skills read ego-browser
./gui/apps/cli/bin/bapx-cli repo skills edit ego-browser --stdin < revised-skill.md
git diff -- skills/ego-browser/SKILL.md
```

Use `list --json` for scripts. On Windows or from `gui/`, the workspace command
is `pnpm bapx-cli repo skills list`. Repository commands act on the tracked
`skills/<name>/SKILL.md` files in the source checkout. To work with skills
installed in bapX Agents, use `bapx-cli skill --help`.

## Verify the public web build

From the Agency checkout root, point `bapx-cli` at the running web image and
pass the Git SHA used to build it. Public web CI uses the same check.

```sh
./gui/apps/cli/bin/bapx-cli repo verify web --revision "$WEB_SHA" --origin http://127.0.0.1:8080
```

To check the deployed HTTPS sites, use `--live` from the checkout for the
deployed SHA. The command checks readiness, routes, branding assets, and
signed-out responses. Verify the affected user flow separately in a browser.

## Run in dev mode

Start the backend and browser UI, then Electron in a second terminal:

```sh
pnpm dev
pnpm exec turbo run dev --filter=@cloudroom/desktop
```

Dev mode uses its own ports and profile. Local agents need their own installed, signed-in CLIs. For remote sessions on your own machine, see [connect the desktop app](../core/docs/setup.md#connect-the-desktop-app).

## Checks

Use the [Agency project index](../docs/project-index.json) to locate a guide,
route, or workspace package. Follow its source pointer and use the
[architecture map](../map.mmd) for build and deployment wiring.

```sh
pnpm exec turbo run test --filter=@cloudroom/scripts --filter=@cloudroom/config --concurrency=2
```

Desktop integration tests open real apps, so run them only in a test environment. The sync and preview helpers in `apps/server/src/assets/` are copies from the core, so change them there.

See [desktop packaging](apps/desktop/README.md) for installer builds and signing.
