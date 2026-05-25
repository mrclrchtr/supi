```
                 _            _                 _                          _
 ___ _   _ _ __ (_)       ___| | __ _ _   _  __| | ___       _ __ ___   __| |
/ __| | | | '_ \| |_____ / __| |/ _` | | | |/ _` |/ _ \_____| '_ ` _ \ / _` |
\__ \ |_| | |_) | |_____| (__| | (_| | |_| | (_| |  __/_____| | | | | | (_| |
|___/\__,_| .__/|_|      \___|_|\__,_|\__,_|\__,_|\___|     |_| |_| |_|\__,_|
          |_|
```

# @mrclrchtr/supi-claude-md

Adds subdirectory context-file discovery to the [pi coding agent](https://github.com/earendil-works/pi).

Pi already handles root and ancestor context files in its own system prompt. This package covers the other half: context files inside subdirectories below your current working directory.

## Install

```bash
pi install npm:@mrclrchtr/supi-claude-md
```

For local development:

```bash
pi install ./packages/supi-claude-md
```

After editing the source, run `/reload`.

## What you get

When the agent touches a file or directory inside the project, this package can inject nearby subdirectory context files into the conversation.

Supported file names by default:

- `CLAUDE.md`
- `AGENTS.md`

How discovery works:

- starts from the target file's directory
- walks upward toward `cwd`
- looks for the configured context-file names in each directory
- injects only files that pi did not already load natively
- injects a subdirectory only once per session unless compaction resets the tracking state

Supported tool paths come from these tools:

- `read`
- `write`
- `edit`
- `ls`
- `lsp`
- `tree_sitter`

## What it does not do

- it does not re-inject root or ancestor context files that pi already loaded
- it does not scan above `cwd`
- it does not add a command or model-callable tool; the behavior is automatic

## Settings

This package registers a **Claude-MD** section in `/supi-settings`.

Available settings:

- `subdirs` — turn subdirectory discovery on or off
- `fileNames` — comma-separated file names to search for in each directory

Defaults:

```json
{
  "claude-md": {
    "subdirs": true,
    "fileNames": ["CLAUDE.md", "AGENTS.md"]
  }
}
```

## Bundled skills

This package also exposes two skills through `resources_discover`:

- `claude-md-improver` — audit and improve `CLAUDE.md` files across a repo
- `claude-md-revision` — update `CLAUDE.md` or `AGENTS.md` with durable project learnings from a session

## Source

- `src/claude-md.ts` — session state, injection flow, and skill registration
- `src/discovery.ts` — subdirectory file discovery
- `src/subdirectory.ts` — context formatting and per-directory injection rules
