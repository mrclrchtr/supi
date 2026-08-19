<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-debug">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-debug/assets/social-preview.png" alt="SuPi Debug" width="100%">
  </a>
</div>

# @mrclrchtr/supi-debug

Adds shared debug-event capture and inspection for SuPi extensions in the [pi coding agent](https://github.com/earendil-works/pi).

## Install

```bash
pi install npm:@mrclrchtr/supi-debug
```

For local development:

```bash
pi install ./packages/supi-debug
```

![Debug event report](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-debug.png)

## What you get

After install, this package wires the shared debug registry into three user-facing surfaces:

- `/supi-debug` — show recent debug events in a readable TUI report
- `debug` — let the model query recent debug events during troubleshooting
- `/supi-settings` integration — configure whether events are captured and how much data is exposed

It also registers a **Debug** provider section for `/supi-context`, and ships a `/supi-tooling-retro` prompt template for post-task retrospective feedback on the SuPi tooling used in the completed task.

## Event behavior

- events are session-local
- sanitized events are also persisted in the session JSONL for later inspection
- the event buffer is cleared on `session_start`
- if debug capture is disabled, no events are retained
- agent-facing access is blocked, sanitized, or raw depending on settings

### Identity disclosure

Retained and persisted LSP debug events may identify local workspaces and files. Since the LSP telemetry expansion, LSP events can carry the absolute workspace root (`cwd`), the configured server name (`server`), workspace-relative file paths (`file`), exact LSP method names (`method`), and the server root (`root`). Identity strings are bounded to 512 UTF-16 code units and server lists to 16 entries.

Identity fields are **not** secret-redacted. The debug registry redacts secret keys and secret-looking values (tokens, passwords, API keys, authorization headers, URL credentials), but server names, file paths, method names, and workspace roots pass through unredacted by design, so local protocol failures stay diagnosable. Treat retained and persisted LSP events as potentially identifying your local machine, project layout, and file names.

## Rendering

`/supi-debug` uses a custom TUI message renderer that shows two levels of detail:

- **Collapsed** (default) — a one-line summary:

  ```
  3 events — lsp/rewrite +2 more
  ```

- **Expanded** — full details with timestamp, level, source/category, message, cwd,
  and data for each event. **Click/expand the collapsed message** in the TUI to reveal
  the full output.

Rendered fields per event:

- timestamp
- level
- `source/category`
- message
- optional `cwd`
- optional `data`
- optional `rawData`
- optional `operationId` for events directly owned by one public `code_*` call

### Why collapsed by default

Event payloads can be large (full command strings, structured data). Collapsing
keeps the conversation focused; expand only when you need the details.

### Seeing full details without expanding

The agent-facing `debug` tool returns the expanded plain-text
representation, subject to PI's standard tool-output truncation limits. This is
useful for automated troubleshooting flows while protecting the model context
from very large event payloads.

## Filters

Both `/supi-debug` and `debug` support the same basic filters:

- `source`
- `level`
- `category`
- exact `operationId`
- `limit`

For historical sessions, pass `sessionFile` to `debug`, or
`sessionFile=<path>` to `/supi-debug`. Historical sessions never retain raw data.
The tool also accepts `includeRaw` for live-session data when settings allow it. A Debug Operation ID groups direct request ownership only. It is not a security identity, distributed trace, raw Pi Tool-call identity, or time-window correlation.

## Settings

This package registers a **Debug** section in `/supi-settings`.

Available settings:

- `enabled` — turn session-local event capture on or off
- `agentAccess` — `off`, `sanitized`, or `raw`
- `maxEvents` — maximum retained events in memory

Historical inspection works for events captured after this version is loaded. For example, an
agent can call `debug` with `sessionFile` set to a PI session JSONL path.

Defaults come from the shared debug registry:

```json
{
  "debug": {
    "enabled": false,
    "agentAccess": "sanitized",
    "maxEvents": 100
  }
}
```

## Extra status logging

If `SUPI_LOG_STATUS` is enabled in the environment, the package emits a versioned SuPi load-status marker to stderr during `resources_discover` (after session-start registrations) and appends the same payload as a session entry. The payload uses `phase: "resources_discover"`. Version 2 reports observed tool and command inventory only; external harnesses decide which resources they require.

## Source

- `src/debug.ts` — settings, command, tool, and registry wiring
- `src/renderer.ts` — custom report renderer
- `src/format.ts` — debug payload formatting
- `src/status-log.ts` — optional load-status logging
