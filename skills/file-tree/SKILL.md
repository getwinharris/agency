---
name: file-tree
description: Manually-invoked skill that prints a nice file tree of the current topic in a code block. Use when the user says "file-tree" or "file tree".
disable-model-invocation: true
triggers: [user, model]
---

give me a nice file tree, inside of a code block, of the thing we are talking about
just the high level structure, if there is too many files or subfolders only show me the main ones. dont overwhelm me. keep it simple.

## Tracked checkout outline

For a Git checkout, run the included script with Node.js and show its output
in a code block. Set `skill_directory` to the location of this skill and
`workspace_directory` to the Git directory the user asked about.

```bash
node "$skill_directory/scripts/tree.mjs" "$workspace_directory"
```

The script shows two levels of tracked files and directories, up to 30 entries.
For a non-Git folder or a conceptual file tree, show the relevant top-level
structure directly.
