# @mrclrchtr/supi-cache

Prompt cache health monitoring and cross-session forensics for the [pi coding agent](https://github.com/earendil-works/pi).

## Install

```bash
pi install npm:@mrclrchtr/supi-cache
```

> **🧪 Beta package** — not included in the `@mrclrchtr/supi` meta-package.
> Install directly when you need cache forensics.

For local development:

```bash
pi install ./packages/supi-cache
```

Edit the source and `/reload` to pick up changes.

## What it adds

**Real-time monitoring** — tracks per-turn cache hit rates and shows a compact footer status (`cache: 80% ↑`). When the hit rate drops below the configured threshold, a warning notification includes the likely cause (compaction, model change, system prompt change, or idle).

**Cross-session forensics** — scans past session files to answer investigative questions across sessions with four query patterns:

- **Hotspots** — worst hit-rate drops across all sessions, ranked by magnitude
- **Breakdown** — tally of regression causes (compaction, model change, prompt change, unknown, idle)
- **Tool correlation** — which tool calls preceded each regression drop
- **Idle-time detection** — gaps between turns that correlate with cache expiry

## Commands and tool

| Surface  | Name | Description |
|----------|------|-------------|
| Command  | `/supi-cache-history` | Per-turn cache metrics table for the current session, with annotated regression details and fingerprint diffs |
| Command  | `/supi-cache-forensics` | Cross-session investigation with themed TUI report. Accepts `--pattern`, `--since`, `--min-drop` filters |
| Tool     | `supi_cache_forensics` | Agent-callable — returns structured JSON with shape fingerprints (param types and lengths, no raw content) |

### Command examples

```text
# Show per-turn history for the current session
/supi-cache-history

# Cause breakdown for the last 7 days
/supi-cache-forensics

# Worst drops from the last 3 days
/supi-cache-forensics --pattern hotspots --since 3d --min-drop 20

# Idle-time detection
/supi-cache-forensics --pattern idle
```

### Agent tool example

```json
{ "pattern": "hotspots", "since": "7d", "minDrop": 20 }
{ "pattern": "breakdown" }
{ "pattern": "correlate", "since": "24h" }
{ "pattern": "idle", "since": "30d" }
```

## Configuration

Config files (project overrides global):

| Scope | Path |
|-------|------|
| Global | `~/.pi/agent/supi/config.json` |
| Project | `.pi/supi/config.json` |

```json
{
  "supi-cache": {
    "enabled": true,
    "notifications": true,
    "regressionThreshold": 25,
    "idleThresholdMinutes": 5
  }
}
```

| Setting | Description | Default |
|---------|-------------|---------|
| `enabled` | Enable/disable monitoring | `true` |
| `notifications` | Show regression warning notifications | `true` |
| `regressionThreshold` | Percentage-point drop that triggers a warning and gates forensics findings | `25` |
| `idleThresholdMinutes` | Minutes of inactivity to classify as idle-time regression | `5` |

Upgrades from the old `cache-monitor` config section are handled automatically.

If you have `/supi-settings` available (for example when also installing the `@mrclrchtr/supi` meta-package), the **Cache** section also appears there with editable fields.

## Provider notes

Some providers do not report cache write tokens in their usage metadata. For example, Anthropic's API returns `cache_read_input_tokens` and `input_tokens` but does not expose cache writes. When using such a provider, the `CacheW` column in `/supi-cache-history` will always show `0`. Providers that do report cache writes (e.g. Google Gemini) will populate the column normally.

## Agent safety

The `supi_cache_forensics` tool returns shape fingerprints, not raw content:

| If the agent sees | It does NOT see |
|---|---|
| `{ "toolName": "bash", "paramKeys": ["command"], "paramShapes": { "command": { "kind": "string", "len": 340, "multiline": true } } }` | The 340-char command text |
| `{ "toolName": "write", "paramKeys": ["file_path", "content"] }` | The file content or exact path |

Human-only detail (`_pathsInvolved`, `_commandSummaries`) is stripped before returning to the agent — the TUI renderer shows richer information.

## Requirements

- `@earendil-works/pi-coding-agent`
- `@mrclrchtr/supi-core`

## Source

Extension entrypoint: `src/index.ts` → `src/monitor/monitor.ts`
