---
name: session-analytics
description: Measure tool usage, tool failures with their follow-up calls, and persisted debug-log volume across past Pi session files by exporting normalized JSONL and aggregating it in a script.
disable-model-invocation: true
compatibility: Requires Node.js and shell access to local Pi session files.
---

# Session analytics

Session storage can hold gigabytes of JSONL across thousands of files, often in directories with spaces. The bundled exporter streams it once and writes one normalized JSONL file; you aggregate that file yourself. Do not grep or `cat` session storage directly: it is slow, breaks on unusual paths, and floods the context.

## Pick the export

| Question | Kind | Useful flags |
| --- | --- | --- |
| Calls per tool, per workspace, per model, over time | `tool-calls` | `--tool`, `--since` |
| Failing calls, their arguments, and what the agent did next | `tool-calls` | `--tool`, `--match <regex>`, `--next <n>` |
| Sessions where a tool was available vs. called | `tool-availability` | `--since` |
| Debug-event bytes and counts by source, level, category | `debug-events` | `--since` |

Filter at export time when you can: `--tool` and `--match` keep the file small. `--match` tests the full result text, not just the exported head.

## Scope

Default to the current workspace tree and state the scope you used. Other projects and sibling worktrees (`--all-workspaces` or `--workspace <path>`) need the user's explicit approval or an explicit request. When the request names no time range, use all dates for small questions and suggest `--since 30d` if the scan is slow.

## Run once

Resolve the script relative to this skill directory:

```bash
output_dir=$(mktemp -d)
node "<absolute-skill-directory>/scripts/export.mjs" tool-calls \
  --workspace "$PWD" --since 30d --output "$output_dir/tool-calls.jsonl"
```

Stdout is a single compact JSON summary: `records`, `filters`, `coverage`, and `limitations`. The output file must not exist yet. Reuse one export for every follow-up question on the same scope rather than rescanning.

## Aggregate in a script

Read the JSONL inside a codemode script with `tools.bash` (`cat`), not `tools.read`, which stops at 50 KB and appends a continuation notice. Parse, aggregate, and return only the counts and a few cited examples. Without codemode, use a short `node -e` script over the file. Never print the whole export into the conversation.

Record fields:

- `tool-calls`: `sessionId`, `sessionFile`, `line`, `cwd`, `timestamp`, `model`, `tool`, `callId`, `args` (truncated; `argsTruncated: true` when cut), `isError` (`null` if no result was recorded), `resultBytes` (UTF-8 bytes of the result text), `resultHead`, and `next`: up to `--next` (default 3) later calls in the same session as `{ tool, args, isError, resultHead }`, so you can see whether a retry worked. Parallel calls from the same assistant message are not in `next`.
- `tool-availability`: one line per session with `available` (every tool added by a system message or compaction checkpoint, so available at some point), `called` (`{ tool: count }`), and `loadoutKnown` (false when the session recorded no system message). With `--since`, only sessions with assistant messages or loadout changes in the window are exported, only calls in the window are counted, and `available` still covers the whole session.
- `debug-events`: `source`, `level`, `category`, `timestamp`, and `bytes` (the size of the stored line). Payloads are never exported.

Truncation: argument strings at 300 characters, arrays at 10 items, nesting at depth 4; result heads at 500 characters (200 in `next`).

## Judge failures with care

For failure follow-ups, classify what `next` shows: a retry with a longer timeout, a narrower command, reading a log, switching tools, or giving up. Say whether the reaction succeeded, using each next call's `isError` and `resultHead`. Treat these as correlations; a session file cannot show whether the agent's reaction was correct.

## Report

Lead with the numbers that answer the question, then the scope (workspace, dates, kind) in one sentence. Name the unit when it is not obvious, for example that debug `bytes` are the stored JSONL line size. Cite examples as `sessionFile:line`. Disclose when `coverage.complete` is false, and name the limitation that matters for the claim:

- Files are read linearly, so abandoned branches and forked session copies count too; forks can double-count early calls.
- Only stored sessions count; deleted or never-persisted sessions are absent.
- Debug events below the persistence level (default `info`) never reach session files, so `debug-events` measures what is stored, not what was emitted.

Exported arguments and result heads can contain sensitive task details; the file is private, so mention its path but do not paste it wholesale.

## CLI flags

| Flag | Behavior and default |
| --- | --- |
| `<kind>` | Required positional: `tool-calls`, `tool-availability`, or `debug-events`. |
| `--workspace <path>` | Sessions whose working directory is in this tree. Defaults to the current directory; mutually exclusive with `--all-workspaces`. |
| `--all-workspaces` | All workspaces in the selected storage, with user-approved scope. |
| `--sessions-dir <path>` | Override storage. Otherwise `PI_CODING_AGENT_SESSION_DIR`, project/global `sessionDir`, then `<PI_CODING_AGENT_DIR or ~/.pi/agent>/sessions`. |
| `--since <date\|Nd>` | Inclusive start: ISO date, timestamp, or days ago. Defaults to all dates. |
| `--max-sessions <n>` | Limit discovered session files (`1`–`100000`, default `5000`). A reached cap makes coverage incomplete. |
| `--output <path>` | Required. New JSONL file; existing files are preserved. |
| `--tool <name>` | `tool-calls` only: export calls of this tool. `next` still lists any tool. |
| `--match <regex>` | `tool-calls` only: export calls whose result text matches (JavaScript regular expression, case-sensitive). |
| `--next <0..20>` | `tool-calls` only: following calls to attach (default `3`). |
| `--help` | Print usage and exit. |
