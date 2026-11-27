---
name: room-cli
description: 'Inspect and control Cloudroom Local and Cloud threads, projects, settings, plugins, and the cloud VM with bapx-cli. Use for bapX CLI tasks.'
---

# Cloudroom CLI

Use `bapx-cli` for bapX Agents. Existing `room-cli` invocations remain supported. Never inspect or message unrelated threads unless the user asks.

## Check context first

```sh
bapx-cli status --json
```

Confirm the server URL and project/thread before acting. Standalone `bapx-cli` targets the installed Cloudroom backend at `http://127.0.0.1:39886`, not the cloud VM. Official BB remains separate.

`--self` uses `ROOM_THREAD_ID` where supported. Thread IDs select Local or Cloud execution; connection settings still point to the same GUI backend.

On Windows (PowerShell), or to point `bapx-cli` at another backend, first read "Shell and environment variables" in [configuration](references/configuration.md).

## Top workflows

### See what is going on

```sh
bapx-cli project list --json
bapx-cli thread list --project PROJECT --status active
bapx-cli thread list --pinned --fields id,title,status
bapx-cli thread show THREAD --json
bapx-cli thread log THREAD      # what it did
bapx-cli thread output THREAD   # its last reply
```

Keep `thread list` small. Filter first: `--project`, `--status`, `--provider`, `--machine local|cloud`, `--pinned`. The table shows the 50 most recently updated threads; `--limit N` or `--all` changes that. `--json` prints every match as full records, about 1.5 KB per thread: pipe it to `jq`, never read it. To read JSON, pick keys with `--fields id,title,status`.

"Open" or "active" threads means threads with `archivedAt: null`. An archived thread is never open or active, whatever its `status` says. `thread list` shows open threads only; `--archived` shows only archived ones, and `--include-archived` shows both.

### Run subagents: fan out, collect, archive

```bash
bapx-cli thread spawn --parent-self --prompt "Task A"   # once per task
# End your turn to wait for free — Cloudroom wakes you when children finish
bapx-cli thread output CHILD
bapx-cli thread archive CHILD_A CHILD_B
```

Use `bapx-cli thread wait --children` only if you must block inside one turn (it times out after 9 minutes, or 100 seconds in Cloud, with exit 2).

### Message or stop a thread

```sh
bapx-cli thread tell THREAD "Continue with this task"
bapx-cli thread tell THREAD --message-file notes.md   # a long message
bapx-cli thread tell --parent "Done: see my branch"   # the thread that started this one
bapx-cli thread stop THREAD
bapx-cli thread queue list THREAD                     # messages still waiting (app CLI only)
```

A Local message steers the running turn. A Cloud message queues. `thread wait --status idle` only checks a status. Queued work may still be waiting. Check the queue and correlate the requested task with its actual output; after compaction, verify a follow-up completes, and after an attachment upload, verify the agent can read its content.

`thread queue` runs only in the Cloudroom app's `room-cli`. Inside a Cloud thread it exits 2. There, check a child instead:

- `bapx-cli thread show CHILD`: `status: active` means it is still working.
- `bapx-cli thread output CHILD` or `thread log CHILD`: what it did.

These can't confirm whether your message is waiting, was received, or was lost. Unchanged output is no reason to resend: an active child may still get it. Cloudroom messages you when the child finishes. Resend only once it is idle and its reply shows the task was never done.

### Unblock a thread that needs input

```sh
bapx-cli thread interactions list THREAD
bapx-cli thread interactions show INTERACTION THREAD
```

`show` prints the question or approval and the exact command that answers it. `thread wait --children` prints this `show` command for each child that needs input.

### Start a Cloud thread

```sh
bapx-cli cloud status --json
bapx-cli thread spawn --project PROJECT --machine cloud --provider codex \
  --model MODEL --request-id UNIQUE_ID --prompt "Task"
```

- Retry an unconfirmed start, Local or Cloud, with the same `--request-id` (an unanswered spawn prints it). For a rejected start, use `bapx-cli cloud retry-start THREAD`. Do not blindly resend uncertain work.
- A Local parent's Cloud child (`--parent-self --machine cloud --provider PROVIDER --model MODEL`) starts from GitHub, so push first and pass `--base-branch BRANCH`. It messages the parent when it finishes.
- Queues, a full disk, the phone, `bapx-cli vm`, and what Cloud agents can do themselves: "Cloud threads" in [thread operation](references/thread-operation.md).

### Schedule work

A loop runs a prompt or script on a schedule, Local or Cloud: `bapx-cli loop --help` and the `automations` skill.

### Tidy up

```sh
bapx-cli thread update THREAD --title "New title"
bapx-cli thread move THREAD --project PROJECT
bapx-cli thread archive THREAD_A THREAD_B
```

Moves, parent links, unarchive, worktrees, and chat from a terminal: "Moving, parents, and worktrees" in [thread operation](references/thread-operation.md).

## Before a Local launch

Inspect `bapx-cli machine provider-cli status MACHINE --json`. A cached model list does not prove the executable is installed or logged in. If Claude is installed but reports `Not logged in`, ask the user to run `claude` and `/login`; do not collect credentials or install another copy.

## Skills the list leaves out

These stay off the skill list to keep it short. Read the file when the task calls for it; each sits next to this skill's folder.

- Build or change a Cloudroom plugin: `../plugin-authoring/SKILL.md`.
- Create or improve a skill: `../skill-creator/SKILL.md`.
- Commands that plugins add: `../plugin-commands/SKILL.md`, or `bapx-cli --help`.
- Share a local server to the user's phone or another device: `bapx-cli connect --help`.

## References

Use `bapx-cli --help`, `bapx-cli GROUP --help`, or `bapx-cli guide CHAPTER` for current options. Read only the relevant reference:

- [Command index](references/command-index.md): all core command paths.
- [Thread creation](references/thread-creation.md): projects, machines, Local launches and forks.
- [Thread operation](references/thread-operation.md): inspection, messaging, queues, files, terminals.
- [Failure recovery](references/failure-recovery.md): failed/stopped Local threads and provider controls.
- [Configuration](references/configuration.md) and [app settings](references/app-settings.md): settings and environment setup.
- [Plugins](references/plugins.md): plugin management; each plugin owns its command instructions.
- [Theme commands](references/theme-commands.md) and [theming](references/theming.md): appearance.

Resolve IDs before mutation. Prefer JSON for scripts. Confirm actual results and report the ID the user needs. Never claim a queued message has completed.
