# bapX Agents desktop

Electron shell for bapX Agents. The packaged `bb-app` launcher starts the embedded
web UI, local server, and host daemon. Its upstream license and notices ship in
each desktop package.

## Development

From `gui/`, run `pnpm dev` in one terminal for the source server and
live UI updates. In a second terminal, start the Electron shell:

```bash
pnpm exec turbo run dev --filter=@cloudroom/desktop
```

The dev script builds `bb-app`, compiles the Electron main/preload files, and
opens Electron directly. By default it uses the same checkout-scoped
`~/.bb-dev/<checkout-instance>` data directory and deterministic high ports as
`pnpm dev`; it prints the resolved data dir, server URL, and
Electron user-data dir at startup. It intentionally overwrites inherited
`BB_DATA_DIR`, `BB_SERVER_PORT`, `BB_SERVER_URL`, and `BB_HOST_DAEMON_PORT` so a
desktop dev run launched from an existing bb session still targets the current
checkout. Set `BB_DESKTOP_USER_DATA_DIR` to override only Electron's user-data
directory.

The launcher probes the checkout's Vite app port at startup and adapts:

- **`pnpm dev` is already running** (Vite reachable): the shell loads the Vite
  dev URL, so you get live source and HMR for `@cloudroom/app` changes — no rebuild
  needed. It still attaches to the same running server/daemon for all API/WS
  traffic. The launcher prints `app <url> (Vite dev server — live reload)`. This
  is the fast loop for iterating on the desktop UI.
- **`pnpm dev` is not running**: the shell starts its own `bb-app` runtime and
  loads the built UI it serves, so you must rebuild (re-run this task) to pick up
  source changes. The launcher prints `app (own bb-app runtime — …)`.

The override is plumbed via `BB_DESKTOP_APP_URL`, which the launcher only sets
when Vite is confirmed reachable; it is never set in packaged builds, so
production always loads the server's own built UI.

To run the slower unpacked Electron Builder app, which more closely matches the
packaged runtime and keeps native dependencies rebuilt for Electron's bundled
Node runtime:

```bash
pnpm exec turbo run start --filter=@cloudroom/desktop
```

Electron is pinned to `44.11.5`. macOS builds require macOS 13 (Ventura) or
newer. The bundled `bb-app` runtime uses `better-sqlite3@13.0.3`, whose N-API
binaries work with Electron without an ABI-specific rebuild. The packaging
hook opens an in-memory database with Electron before accepting the packaged
SQLite module; older ABI-specific modules still use the prebuild fallback.

## Validation

```bash
pnpm exec turbo run typecheck --filter=@cloudroom/desktop --filter=bb-app
pnpm exec turbo run build --filter=@cloudroom/desktop
pnpm exec turbo run test --filter=@cloudroom/desktop --filter=bb-app --force
pnpm exec turbo run dev --filter=@cloudroom/desktop
```

## Packaging

```bash
pnpm --dir apps/desktop run dist
pnpm --dir apps/desktop run smoke:packaged
```

Artifacts are written under `gui/apps/desktop/release.noindex/`. The Mac build
targets Apple Silicon and produces `bapx-agents-v0.1.0-arm64.dmg` and
`bapx-agents-v0.1.0-arm64.zip`. Run packaging and its smoke check on an Apple
Silicon Mac. Without signing secrets, local builds
sign with a code-signing identity auto-discovered from the keychain and skip
notarization. A valid signature matters even for local builds: macOS
provenance-tracks unsigned apps, forcing syspolicyd to evaluate every exec in
the app's process tree, which can stall process launches system-wide. On
machines with no keychain identity (or with `CSC_IDENTITY_AUTO_DISCOVERY=false`,
for an unsigned local build), artifacts remain unsigned and
macOS shows the normal Gatekeeper warning on first launch.

For local verification without publishing, use
`pnpm exec turbo run package --filter=@cloudroom/desktop` on macOS, or
`pnpm exec turbo run package:linux --filter=@cloudroom/desktop` on Linux.

npm's bundled dependencies are copied through an explicit `files` entry into
`node_modules/npm/node_modules`, including nested dependency versions. pnpm's
dependency listing omits this bundled tree, and electron-builder's dependency
copier excludes nested `node_modules`. `asarUnpack` alone cannot preserve files
that the collector never selected. The explicit file set enters both ASAR's
file index and its unpacked resources before signing.

Packaging runs an offline npm smoke check in `afterPack`, before signing or
publishing. This requires a native target host (macOS arm64 or Linux x64).
`smoke:packaged` repeats it against the resulting artifact. To run only npm
verification without opening a desktop window:

```bash
pnpm exec turbo run smoke:packaged-npm --filter=@cloudroom/desktop
pnpm exec turbo run smoke:packaged-npm --filter=@cloudroom/desktop -- "/Applications/bapX Agents.app/Contents/MacOS/bapX Agents"
```

On Linux, the optional argument is the executable inside `linux-unpacked/` or
an extracted AppImage. The check resolves npm from packaged `bb-app`, audits
required dependency edges and version ranges in npm's entire bundled tree using
both CJS and ESM resolution, rejects paths outside packaged resources, imports npm's ESM display
dependencies, and verifies its version. It then uses bundled Electron and npm
to pack, install, and update a disposable plugin's dependency from 1.0.0 to
2.0.0, verifying the lockfile and importing the plugin's ESM entry after each
install. It uses the plugin install flags, an empty PATH, offline mode, a fresh
HOME/cache/config, and disabled lifecycle scripts. No system Node/npm or user
store is used by the child processes. It also hashes ASAR and unpacked resources
before and after to reject bundle mutations. Fixtures are removed afterward.

The bb-app tarball smoke covers a different packaging pipeline and cannot
detect Electron artifact omissions. A source build or `npm --version` alone
does not verify a desktop plugin dependency install.

### Windows (NSIS, x64)

Windows packaging needs a Windows x64 host: `afterPack` loads the packaged
native modules to verify them. Install with
`pnpm install --frozen-lockfile --ignore-scripts`, then
`node apps\desktop\node_modules\electron\install.js`, then from `gui/`:

```powershell
pnpm --dir apps/desktop run dist:win
pnpm --dir apps/desktop run smoke:packaged
```

The one-click, per-user NSIS installer is `bapx-agents-v0.1.0-x64.exe`. It installs
`bapX Agents.exe` under `%LOCALAPPDATA%\Programs\bapx-agents`. The nightly
installer uses `bapx-agents-nightly`. `/S` installs or uninstalls silently.
The installer bundles Python for the preview helper. Install Git for Windows
separately. The detached
preview helper keeps that `python.exe` open, so before the installer replaces
or removes files, `build/installer.nsh` asks the helper to `pause`, then
force-stops any `python*.exe` still running from the install folder.
electron-builder's own check misses a single process on Windows PowerShell 5.1.

Without `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` the installer is unsigned,
and SmartScreen can warn before it runs. Verify the signed installer from
PowerShell using `Get-AuthenticodeSignature .\apps\desktop\release.noindex\bapx-agents-v0.1.0-x64.exe`.

`afterPack` copies `@parcel/watcher-win32-x64` into the package, because
electron-builder leaves it out, and loads it with the packaged Electron.

Inside the installed app, `room-cli.cmd` and `room-cli.ps1` run on
`bapX Agents.exe` with `ELECTRON_RUN_AS_NODE=1`, so the PC needs no Node.
PowerShell picks `room-cli.ps1`, which passes arguments as JSON in
`ROOM_CLI_ARGV`, so cmd.exe never re-parses them.

### Linux (AppImage, x64)

Linux packaging targets x64 glibc-based distributions. Install `python3`,
`make`, and `g++` so node-gyp can build node-pty during dependency installation.

From `gui/`, build an unpacked app, an AppImage distribution, or smoke
test the current packaged output with:

```bash
pnpm exec turbo run package:linux --filter=@cloudroom/desktop
pnpm exec turbo run desktop:build:linux --filter=@cloudroom/desktop
pnpm exec turbo run smoke:packaged --filter=@cloudroom/desktop
```

Running an AppImage normally requires FUSE and, on some distributions, the
`libfuse2` compatibility package. If FUSE is unavailable, launch it with
`--appimage-extract-and-run` instead.

Linux users whose window manager supplies all window controls can remove the
native Electron title bar with `--no-window-frame`:

```bash
./bapx-agents-v0.1.0-x86_64.AppImage --no-window-frame
```

The native frame remains the default. Changing this startup option requires a
full desktop app restart.

Linux users can opt into a transparent Electron window with
`--transparent-window`:

```bash
./bapx-agents-v0.1.0-x86_64.AppImage --transparent-window
```

The window remains opaque by default. Transparency also requires a compositor
that supports it, and Electron documents limitations including unsupported
window shaping and unreliable resize behavior on some platforms. The flag can
be combined with `--no-window-frame`, and changing it requires a full desktop
app restart.

The Desktop packages workflow builds the Linux x64 AppImage on Ubuntu 24.04.
The package links against the build machine's glibc. Agency Linux builds use
manual installation and updates.

## Releasing

Set `version` in `gui/apps/desktop/package.json` when changing the desktop
release version. Both native package commands stamp that version into the
bundle, installer name, and About panel. Ordinary development builds show
`dev`. The desktop release has its own version and build process.

The Desktop packages workflow builds native Apple Silicon, Windows x64, and
Linux x64 artifacts and uploads verified packages with SHA-256 checksums.
The macOS job uses an ad-hoc signature for launch checks. Distributable macOS
builds require an Apple Developer ID signature and notarization. Windows
verification uses a silent install on a Windows Server runner. Verify the
intended desktop OS before publishing the release in Agency.

The stable app uses bundle and Windows application ID `in.bapx.agents`,
`~/.bapx-agents` for runtime data, and local ports 39888 and 39889. The desktop
registers `bapx-agents://` and installs the `bapx-agents-cli` shell shim on
macOS and Linux.

Set `BB_DESKTOP_RELEASE_CHANNEL=nightly` for the separate bapX Agents Nightly
build. It uses ID `in.bapx.agents.nightly`, runtime data in
`~/.bapx-agents-nightly`, and ports 39890 and 39891. Nightly artifacts and
executables carry a nightly name. Its shell shim is `bapx-agents-nightly-cli`.

## About panel

The app menu's About item opens a message box listing the facts a bug report
needs: version, build type, commit, build date and how old that build is
("3 days old"), plugin SDK version, Electron version, and OS. Its **Copy**
button puts that whole block on the clipboard. The age is computed when the
dialog opens, so a long-running session still reports it correctly.

The native About panel is populated too, minus the age, since Electron takes
those options once at startup. `scripts/build.mjs` bakes the build-time half of
the facts into the bundles:

| Variable                | Default when unset                                    |
| ----------------------- | ----------------------------------------------------- |
| `BB_DESKTOP_COMMIT`     | `GITHUB_SHA`, else `git rev-parse HEAD`, else unknown |
| `BB_DESKTOP_BUILD_DATE` | The build's own timestamp, ISO 8601                   |

The plugin SDK version is read from `packages/plugin-sdk/package.json` at build
time. A checkout with no git metadata reports `Commit: unknown` rather than
failing the build.

## macOS signing + notarization

The [signing wrapper](scripts/run-electron-builder.mjs)
signs and notarizes when `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` are all set, then notarizes
and staples the DMG too. A partial set fails before packaging. For the
installer-only notarization path, set `CLOUDROOM_NOTARIZE_LATER=1` and run
[notarize-once.sh](scripts/notarize-once.sh) after building the signed DMG. Locally,
`APPLE_KEYCHAIN_PROFILE=<notarytool profile>` does the same with the Keychain's
Developer ID identity. Local builds with neither sign via keychain
auto-discovery and skip notarization.

## Auto-update

Desktop packages have automatic updates disabled by default. Set
`BAPX_DESKTOP_UPDATES=1` when building signed stable releases on Mac and
Windows. The Mac build requires notarization. The Windows build requires a
signing certificate. The feed is the [Agency desktop release](https://github.com/getwinharris/agency/releases/tag/desktop-latest).
Publish the signed package, generated metadata (`latest-mac.yml` for Mac or
`latest.yml` for Windows), and associated update artifacts together under
that tag. Native build commands use `--publish never` so publication is a
separate release step.

For local updater testing, bake a test endpoint into the build with
`BB_DESKTOP_UPDATE_BASE_URL=http://127.0.0.1:PORT/`.

On Mac, Squirrel.Mac cancels the install ("App Still Running") if the old version opens before it's done,
e.g. from the Dock right after **Restart to update**. That old version quits once and lets it finish. A restart that
still leaves the old version shows "The last update didn't install" with Restart and the website **Download**,
and that run never restarts by itself when idle; a click here, in a browser, or on a phone still does.

When this Mac user can't write the app, **Restart to update** first asks for the Mac password. An unanswered
prompt closes after 2 minutes and the button works again. An app opened from the disk image or translocated
from Downloads is read-only, so Squirrel.Mac can never replace it: it skips the in-app update. So does an app on
another disk than Applications: Squirrel.Mac's swap across disks can fail halfway and delete it (#2511). A pop-up over
the app (and over setup) offers **Move to Applications** (`app.moveToApplicationsFolder()`), which stops Local
agents, copies the app, and reopens it from Applications; the agents resume. **Not now** hides it until the
next launch, and the update banner still asks to move it.

Windows reads `latest.yml` from the same release, downloads the `.exe` in the
background, and runs it silently on quit. **Restart to update** keeps bapX Agents
open until the installer's progress window shows (the installer then closes it),
and reopens bapX Agents when it finishes. Before anything stops, it checks the downloaded installer
is still on disk. If the installer can't start, bapX Agents reopens on the old
version. If the failure comes after bapX Agents has quit, the next launch sees
the old version and offers the download again.

To verify a downloaded or unpacked build:

```bash
spctl --assess --verbose "/Applications/bapX Agents.app"
codesign --verify --deep --strict --verbose=2 "/Applications/bapX Agents.app"
```

## Debugging

Use the View menu to toggle DevTools. To open them automatically on launch, set
`BB_DESKTOP_OPEN_DEVTOOLS=1`:

```bash
BB_DESKTOP_OPEN_DEVTOOLS=1 "apps/desktop/release.noindex/mac-arm64/bapX Agents.app/Contents/MacOS/bapX Agents"
```

When the desktop app spawns `bb-app`, server and daemon logs land under
`~/.bapx-agents/logs/` or the `logs/` directory under a custom runtime profile.

To verify attach-if-found manually, start a compatible bb first, then launch the
desktop app:

```bash
npx bb-app@latest
pnpm exec turbo run dev --filter=@cloudroom/desktop
```

The desktop supervisor handles normal quits plus `SIGINT` and `SIGTERM`, and it
writes a PID file so the next launch can reap a stale Electron-owned `bb-app`
launcher. Hard crashes such as process aborts, segfaults, or kernel-level kills
cannot run cleanup in the crashing process; the startup PID-file reap is the
recovery path for those cases.
