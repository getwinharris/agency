# bapX Agents

bapX Agents is the bapX fork of Cloudroom for running native coding agents on a
Mac and a private Linux Core. Agency is the GitHub source for the app, public
website, documentation, MediaHub, and its operator workspace.

[bapX](https://bapx.in/) · [Documentation](https://docs.bapx.in/) ·
[MediaHub](https://mediahub.bapx.in/) · [Admin](https://admin.bapx.in/) ·
[Agency releases](https://github.com/getwinharris/agency/releases)

The [bapX release notes](gui/docs/release-notes.md) record verified web
deployments and desktop download availability.

The [architecture map](map.mmd) traces public routes, private runtime, and
deployment boundaries. The [Agency project index](docs/project-index.json)
maps a host, published guide, workflow, or workspace package to tracked
source. Stage added or removed inputs and run `./gui/apps/cli/bin/bapx-cli repo inventory generate`
from a Git checkout with Node.js and Docker Compose to regenerate both files.
`./gui/apps/cli/bin/bapx-cli repo inventory check` catches drift. Follow the source pointer
and verify runtime behavior separately. Use `repo inventory map` or
`repo inventory index` with the same checkout launcher to print a report.

The installed `bapx-cli` command manages agents and their tools. Existing
`room-cli` invocations still work on supported installations. Use the
[checkout skills commands](gui/README.md#work-with-repository-skills) to work with tracked Agency skills. [CLI configuration](gui/docs/configuration.md#cloudroom-cli)

## Upstream Cloudroom

The following upstream overview describes the architecture and Cloudroom's
original distribution. Follow bapX documentation for bapX releases.

<p align="center">
  <img src=".github/readme/runtime.png" alt="Any harness, in the cloud. Claude Code, Codex, Pi, and OpenCode each run their own CLI in an isolated sandbox, with Cloudroom core next to it. Sessions stream live to the app and teleport between your Mac and the cloud." width="100%">
</p>

<p align="center">
  <a href="#how-the-cloud-works"><b>How it works</b></a> ·
  <a href="core/docs/harnesses.md">Harness adapters</a> ·
  <a href="core/docs/setup.md">Self-host</a> ·
  <a href="core/docs/api.md">HTTP API</a> ·
  <a href="https://github.com/davidondrej/cloudroom/releases/latest">Upstream Cloudroom releases</a>
</p>

<p align="center">
  <a href="https://github.com/davidondrej/cloudroom/releases/latest"><img src="https://img.shields.io/github/v/release/davidondrej/cloudroom?style=flat&color=BFFF00&labelColor=0a0a0a&label=app" alt="Latest app release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-BFFF00?style=flat&labelColor=0a0a0a" alt="Apache 2.0 license"></a>
</p>

Cloudroom runs any coding agent harness in the cloud. Claude Code, Codex, Pi, OpenCode, and others run as their own CLIs, each in an isolated sandbox with its own Git branch. A running session can move between your Mac and the cloud.

## Why it exists

Coding agents like Claude Code and Codex are command-line programs. They run in one terminal, on one computer, and stop when it sleeps.

Claude Code on the web runs only Claude Code. Codex cloud runs only Codex.

Cloudroom divides the work. The harness keeps its agent loop, tools, and login. Cloudroom core, a Rust service, keeps the sandbox, the process, the queue, the recorded history, and recovery. 7 harnesses run this way today, over 4 native protocols.

Core records each harness's native session, so a running session can move. Teleport freezes it, moves its history, and resumes it on the other side, with the same chat, model, and effort.

For Apple Silicon Macs (macOS 13+), Linux x64, and Windows 11.

<p align="center">
  <img src=".github/teleport.png" alt="Teleport moves a running agent between your Mac and the cloud, with the same chat, model, and effort." width="100%">
</p>

## What's in this repo

- [`gui/`](gui/): the desktop app, built on [BB](https://github.com/get-bb/bb).
- [`gui/apps/www/`](gui/apps/www/) builds the first-party sites and developer Docs.
- [`core/`](core/): the Rust service that runs agents in the cloud and saves their history.
- [`skills/`](skills/): the skills every Cloudroom agent ships with.

## Get started

**Use the app.** [Build bapX Agents](gui/README.md) from this checkout. See Docs
for [macOS](https://docs.bapx.in/#mac) and
[Windows or Linux](https://docs.bapx.in/#windows-linux) build options. Published
bapX builds will appear in [Agency releases](https://github.com/getwinharris/agency/releases).

**Host a private Core.** See the [private Core overview](https://docs.bapx.in/#private-core),
follow the [Ubuntu setup guide](core/docs/setup.md), and
[pair the app](core/docs/setup.md#connect-the-desktop-app) with your server's
URL and token.

**Install project skills.** See the [project skills guide](https://docs.bapx.in/#portable-skills)
for setup and native agent discovery.

**Build from source.** The app: see [gui/README.md](gui/README.md). The core needs Rust 1.89+:

```sh
cd core
cargo build --locked --release
cargo test --locked --all-targets
```

Core docs: [HTTP API](core/docs/api.md) · [storage](core/docs/storage.md) · [harnesses](core/docs/harnesses.md) · [session lifecycle](core/docs/session-lifecycle.md) · [diagnostics](core/docs/observability.md) · [dashboard API](core/docs/dashboard.md)

## How the cloud works

Every Cloud thread gets its own sandbox, running Cloudroom core next to the agent. The app talks to it directly. Self-hosted, the same core runs on your own machine.

<p align="center">
  <img src="core/docs/architecture.png" alt="Cloudroom architecture: one cloud sandbox per agent, each running Cloudroom core and the agent, with the app on your Mac." width="80%">
</p>

## Telemetry

The desktop app sends usage stats to Cloudroom: app starts, thread and message counts, token totals, plugin use, and scrubbed errors. Never your prompts, code, or files. Dev runs (`pnpm dev`) send nothing.

Turn it off in Settings → General → Privacy & diagnostics, or set `CLOUDROOM_TELEMETRY=false` or `DO_NOT_TRACK=1`.

Every event is listed in [`telemetry.ts`](gui/apps/server/src/services/system/telemetry.ts). Details: [privacy policy](https://www.cloudroom.dev/privacy).

## Security

- Agents run as a separate Linux user, with no admin rights.
- Every API request needs a secret token. The API listens only on localhost unless you put it behind HTTPS.
- History stays on your machine's own disk.
- Agents run without approval prompts, so give each trusted user their own machine.

Report vulnerabilities privately: see [SECURITY.md](.github/SECURITY.md).

## Contributing

Issues and pull requests are welcome. For big changes, open an issue first. See [CONTRIBUTING.md](.github/CONTRIBUTING.md).

Licensed under [Apache 2.0](LICENSE). BB's MIT notice is in [NOTICE](NOTICE).
