# Core command index

This index lists every command path that the core CLI registers. Read the task-specific reference before you use a command. Check live help for flags and defaults.

## cloud

- `bapx-cli cloud`
- `bapx-cli cloud status`
- `bapx-cli cloud check`
- `bapx-cli cloud sign-in`
- `bapx-cli cloud cancel`
- `bapx-cli cloud logout`
- `bapx-cli cloud codex`
- `bapx-cli cloud codex status`
- `bapx-cli cloud codex login`
- `bapx-cli cloud codex cancel`
- `bapx-cli cloud github`
- `bapx-cli cloud github status`
- `bapx-cli cloud github login`
- `bapx-cli cloud github cancel`
- `bapx-cli cloud cursor`
- `bapx-cli cloud cursor status`
- `bapx-cli cloud cursor login`
- `bapx-cli cloud cursor cancel`
- `bapx-cli cloud cursor key`
- `bapx-cli cloud pi`
- `bapx-cli cloud pi key`
- `bapx-cli cloud teleport THREAD [--check|--wait [--timeout SECONDS]|--status|--cancel|--to-local]`
- `bapx-cli cloud retry-start`
- `bapx-cli cloud clear-disk THREAD`
- `bapx-cli cloud thread-workspace`
- `bapx-cli cloud share THREAD [--status|--stop]`
- `bapx-cli cloud env list|set NAME|unset NAME`
- `bapx-cli cloud repo add|remove OWNER/NAME`
- `bapx-cli cloud setup set`
- `bapx-cli cloud auto-delete [30|90|180|365|never]`

`sign-in --project ID` prints the browser link for connecting the account's existing VM. `--website-url http://127.0.0.1:PORT` is for local website development. All commands accept `--json`. Logout removes this app's VM credentials, not remote jobs or local history. Existing cloud bindings block switching to another account/core. `retry-start` retries a rejected launch with its saved prompt and original request ID; it never reruns an existing cloud session.

`cloud env`, `repo`, and `setup` change Settings → Cloud environment for every new cloud sandbox. `env set NAME` and `setup set` read the value from stdin, never an argument; `env list` shows key names and the last 4 characters of long values, never the values. `auto-delete` shows or sets Settings → Auto-delete; `never` keeps unused cloud threads forever. Before installing a tool with `setup set`, read https://www.cloudroom.dev/docs/cloud-environment.md: tools must land on the agents' PATH, and `setup set` replaces the whole script, so keep its old lines.

`thread-workspace` reads the thread's live cloud directory, branch, and commit. An unavailable core never falls back to the local checkout.

## vm

- `bapx-cli vm`
- `bapx-cli vm run`
- `bapx-cli vm pull`
- `bapx-cli vm push`

`bapx-cli vm run 'COMMAND' [--thread ID] [--cwd DIR] [--stdin]`, `vm pull VM_PATH [LOCAL_PATH] [--thread ID]`, and `vm push LOCAL_PATH [VM_PATH] [--thread ID]` run commands and copy files as the agent account, in the agent home by default. `--thread ID` targets that Cloud thread's sandbox and wakes it; a subagent has its own unless it was started with `--shared-sandbox`. Without it, they target the signed-in VM, and accounts without a VM must pass `--thread`. Find a thread's repository folder with `bapx-cli cloud thread-workspace ID`. `run` exits with the command's code, except 1 when it succeeded but its output passed 16 MiB and was cut; it still ran, so redirect output there if only the status matters. Copies are tar archives and follow `cp`: an existing folder or a path ending in `/` gets the copy inside it; any other path is its new name and must not exist yet; unlike `cp`, a `.` source copied into a folder lands as a subfolder named after it. Push sends big ones in pieces; pull is limited to 16 MiB compressed. `~` means the VM agent home.

## import

- `bapx-cli import`
- `bapx-cli import bb`
- `bapx-cli import claude-code [--days N] [--config-dir FOLDER] [--dry-run] [--json]`
- `bapx-cli import codex [--days N] [--dry-run] [--json]`
- `bapx-cli import pi [--days N] [--dry-run] [--json]`
- `bapx-cli import hermes [--days N] [--dry-run] [--json]`
- `bapx-cli import t3code [--days N] [--dry-run] [--json]`
- `bapx-cli import conductor [--days N] [--path EXPORT] [--dry-run] [--json]`
- `bapx-cli import share LINK [--json]`

`import bb` copies every open BB thread into an idle Local thread with its full history, title, harness, and model. It forks each native session, so it sends no prompts and never changes BB. Re-running skips threads already imported.

`import claude-code`, `import codex`, `import pi`, `import hermes`, `import t3code`, and `import conductor` copy this Mac's chats from the last N days (default 30) into idle Local threads. Each forks the native session on its first new message, so the agent keeps its memory; Hermes chats come over as text instead, as hidden context for a fresh session. T3 Code chats keep T3's titles; its Claude Code and Codex chats fork, and chats from other agents come over as text. `import conductor` reads Conductor's Mac database the same way; `--path` instead imports every chat in a Conductor Cloud export (its unzipped folder or the .zip). Claude Code chats keep their memory even without a transcript on this Mac, because Cloudroom rebuilds the session from Conductor's copy. The timeline shows user and agent messages. Cloudroom's own sessions, subagents, and already-imported chats are skipped. `--dry-run` lists them without importing. `import claude-code --config-dir FOLDER` reads another Claude Code config folder (a `CLAUDE_CONFIG_DIR`) instead of the default; each imported chat is copied into the default folder so it keeps its memory, and the original stays. Run it on the Mac that runs the Cloudroom app: the chats are read there, and another Mac's `room-cli` is refused. The same picker is in Settings → Import chats.

`cloud share` makes a read-only `cloudroom.dev/s/...` link to a thread's messages (no tool output or files, secrets removed), or updates its copy; `--stop` deletes it. `import share` copies a shared thread into a new Local thread whose agent starts by reading it.

## feedback

- `bapx-cli feedback`
- `bapx-cli report`

`bapx-cli feedback "MESSAGE"` sends David, Cloudroom's founder, a bug, friction, or idea (ADR 0158): what you did, what happened, and the exact error. Never include secrets, personal data, or the user's code. The app adds its version, OS, and thread details. It prints `{"sent":false}` while Settings → Send agent feedback is off. `bapx-cli report` is the old name and still works. It works the same in Cloud threads.

## status

- `bapx-cli status`

## settings

- `bapx-cli settings`
- `bapx-cli settings show`
- `bapx-cli settings ai-services`
- `bapx-cli settings general`
- `bapx-cli settings completed-turns`
- `bapx-cli settings experiment`
- `bapx-cli settings keyboard`
- `bapx-cli settings keyboard hints`
- `bapx-cli settings keyboard list`
- `bapx-cli settings keyboard set`
- `bapx-cli settings keyboard reset`
- `bapx-cli settings ui`
- `bapx-cli settings ui list`
- `bapx-cli settings ui get`
- `bapx-cli settings ui set`
- `bapx-cli settings ui reset`
- `bapx-cli settings usage`
- `bapx-cli settings version`
- `bapx-cli settings reload`

## project

- `bapx-cli project`
- `bapx-cli project source`
- `bapx-cli project source add`
- `bapx-cli project source update`
- `bapx-cli project source delete`
- `bapx-cli project attachment`
- `bapx-cli project attachment upload`
- `bapx-cli project attachment download`
- `bapx-cli project list`
- `bapx-cli project history`
- `bapx-cli project reorder`
- `bapx-cli project branches`
- `bapx-cli project paths`
- `bapx-cli project commands`
- `bapx-cli project files`
- `bapx-cli project content`
- `bapx-cli project create`
- `bapx-cli project show`
- `bapx-cli project update`
- `bapx-cli project delete`

`bapx-cli project show <id>` accepts `proj_personal` to inspect Personal.

## provider

- `bapx-cli provider`
- `bapx-cli provider list`
- `bapx-cli provider models`

## manager

- `bapx-cli manager`
- `bapx-cli manager hire`
- `bapx-cli manager list`
- `bapx-cli manager status`
- `bapx-cli manager delete`

## machine

- `bapx-cli machine`
- `bapx-cli machine providers`
- `bapx-cli machine enroll`
- `bapx-cli machine env`
- `bapx-cli machine env list`
- `bapx-cli machine env set`
- `bapx-cli machine env unset`
- `bapx-cli machine create`
- `bapx-cli machine list`
- `bapx-cli machine show`
- `bapx-cli machine join-code`
- `bapx-cli machine rename`
- `bapx-cli machine remove`
- `bapx-cli machine suspend`
- `bapx-cli machine resume`
- `bapx-cli machine reconcile`
- `bapx-cli machine retry-cleanup`
- `bapx-cli machine retry-update`
- `bapx-cli machine provider-cli`
- `bapx-cli machine provider-cli status`
- `bapx-cli machine provider-cli install`

`bapx-cli thread spawn --new-machine <provider-id>` creates a machine for a new
environment and requires `--environment-provider <id>`. For a composed option,
use `--environment-provider <composition-id>` alone. `--machine-inputs <json>`
configures the machine with optional configured `preset` and `image` names;
`--environment-inputs <json>` configures the workspace. Neither carries secrets.

## updates

- `bapx-cli updates`
- `bapx-cli updates status`
- `bapx-cli updates apply`

## terminal

- `bapx-cli terminal`
- `bapx-cli terminal list`
- `bapx-cli terminal create`
- `bapx-cli terminal start`
- `bapx-cli terminal show`
- `bapx-cli terminal attach`
- `bapx-cli terminal send`
- `bapx-cli terminal resize`
- `bapx-cli terminal output`
- `bapx-cli terminal wait`
- `bapx-cli terminal rename`
- `bapx-cli terminal restart`
- `bapx-cli terminal close`
- `bapx-cli terminal stop`

## thread

- `bapx-cli thread`
- `bapx-cli thread wait`
- `bapx-cli thread spawn`
- `bapx-cli thread fork`
- `bapx-cli thread list`
- `bapx-cli thread show`
- `bapx-cli thread log`
- `bapx-cli thread output`
- `bapx-cli thread open`
- `bapx-cli thread pane`
- `bapx-cli thread section`
- `bapx-cli thread section list`
- `bapx-cli thread section create`
- `bapx-cli thread section rename`
- `bapx-cli thread section delete`
- `bapx-cli thread search`
- `bapx-cli thread history`
- `bapx-cli thread read`
- `bapx-cli thread unread`
- `bapx-cli thread reorder-pinned`
- `bapx-cli thread count`
- `bapx-cli thread queue`
- `bapx-cli thread queue list`
- `bapx-cli thread queue create`
- `bapx-cli thread queue update`
- `bapx-cli thread queue send`
- `bapx-cli thread queue delete`
- `bapx-cli thread queue reorder`
- `bapx-cli thread tabs`
- `bapx-cli thread tabs show`
- `bapx-cli thread tabs set`
- `bapx-cli thread update`
- `bapx-cli thread move`
- `bapx-cli thread archive`
- `bapx-cli thread unarchive`
- `bapx-cli thread pin`
- `bapx-cli thread unpin`
- `bapx-cli thread delete`
- `bapx-cli thread edit-message`
- `bapx-cli thread tell`
- `bapx-cli thread chat`
- `bapx-cli thread retry`
- `bapx-cli thread stop`
- `bapx-cli thread compact`
- `bapx-cli thread context`
- `bapx-cli thread clear`
- `bapx-cli thread cancel-plan`
- `bapx-cli thread clear-goal`
- `bapx-cli thread pause-goal`
- `bapx-cli thread resume-goal`
- `bapx-cli thread set-goal`
- `bapx-cli thread interactions`
- `bapx-cli thread interactions list`
- `bapx-cli thread interactions show`
- `bapx-cli thread interactions approve`
- `bapx-cli thread interactions grant`
- `bapx-cli thread interactions answer`
- `bapx-cli thread interactions respond`
- `bapx-cli thread interactions deny`

## environment

- `bapx-cli environment`
- `bapx-cli environment providers`
- `bapx-cli environment list`
- `bapx-cli environment delete`
- `bapx-cli environment show`
- `bapx-cli environment status`
- `bapx-cli environment branches`
- `bapx-cli environment paths`
- `bapx-cli environment diff`
- `bapx-cli environment diff-files`
- `bapx-cli environment diff-file`
- `bapx-cli environment diff-patch`
- `bapx-cli environment update`
- `bapx-cli environment commit`
- `bapx-cli environment archive-threads`
- `bapx-cli environment pull-request`
- `bapx-cli environment pull-request show`
- `bapx-cli environment pull-request ready`
- `bapx-cli environment pull-request draft`
- `bapx-cli environment pull-request merge`

## file

- `bapx-cli file`
- `bapx-cli file read`
- `bapx-cli file write`
- `bapx-cli file list`
- `bapx-cli file paths`
- `bapx-cli file mkdir`
- `bapx-cli file move`
- `bapx-cli file remove`

## theme

- `bapx-cli theme`
- `bapx-cli theme list`
- `bapx-cli theme set`
- `bapx-cli theme dir`
- `bapx-cli theme favicon`
- `bapx-cli theme favicon set`
- `bapx-cli theme favicon reset`
- `bapx-cli theme show`
- `bapx-cli theme reset`

## plugin

- `bapx-cli plugin`
- `bapx-cli plugin search`
- `bapx-cli plugin list`
- `bapx-cli plugin source`
- `bapx-cli plugin install`
- `bapx-cli plugin outdated`
- `bapx-cli plugin update`
- `bapx-cli plugin new`
- `bapx-cli plugin types`
- `bapx-cli plugin migrate`
- `bapx-cli plugin build`
- `bapx-cli plugin dev`
- `bapx-cli plugin reload`
- `bapx-cli plugin rpc`
- `bapx-cli plugin rpc list`
- `bapx-cli plugin rpc inspect`
- `bapx-cli plugin rpc call`
- `bapx-cli plugin enable`
- `bapx-cli plugin disable`
- `bapx-cli plugin safe-mode`
- `bapx-cli plugin config`
- `bapx-cli plugin token`
- `bapx-cli plugin run`
- `bapx-cli plugin logs`
- `bapx-cli plugin remove`

## marketplace

- `bapx-cli marketplace`
- `bapx-cli marketplace add`
- `bapx-cli marketplace list`
- `bapx-cli marketplace refresh`
- `bapx-cli marketplace remove`

## skill

- `bapx-cli skill`
- `bapx-cli skill list`
- `bapx-cli skill show`
- `bapx-cli skill files`
- `bapx-cli skill update`
- `bapx-cli skill delete`
- `bapx-cli skill search`
- `bapx-cli skill registry`
- `bapx-cli skill registry detail`
- `bapx-cli skill install`
- `bapx-cli skill cli-skills-status`
- `bapx-cli skill install-cli-skills`

## guide

- `bapx-cli guide`

## voice

- `bapx-cli voice`
- `bapx-cli voice transcribe`

## browser

- `bapx-cli browser`
- `bapx-cli browser instances`
- `bapx-cli browser tabs`
- `bapx-cli browser create`
- `bapx-cli browser acquire`
- `bapx-cli browser connection`
- `bapx-cli browser release`
- `bapx-cli browser reveal`
- `bapx-cli browser close`
- `bapx-cli browser capture`
- `bapx-cli browser watch`
- `bapx-cli browser import-sources`
- `bapx-cli browser import-cookies`

Machine lists and name/ID selectors include machines still being created. Machine creation is durable: `create --no-wait` returns the creating host ID. `machine show <host-id>` reads progress and `machine remove <host-id>` cancels it. SIGINT only stops following.

Machine environment: `bapx-cli machine env list`, `bapx-cli machine env set NAME`
(value from stdin), and `bapx-cli machine env unset NAME`; all accept `--json`.

Standalone `bapx-cli machine create` machines remain until explicitly removed.
