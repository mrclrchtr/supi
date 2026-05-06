# @mrclrchtr/supi-cache

Prompt cache health monitoring and cross-session forensics for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

## What it adds

**Real-time monitoring** — tracks per-turn cache metrics, detects regressions, and shows a compact footer status (`cache: 80% ↑`).

**Cross-session forensics** — scans past session files to answer investigative questions about cache performance across sessions:

- **Hotspots** — worst hit-rate drops across all sessions, ranked by magnitude
- **Cause breakdown** — tally of regression causes (compaction, model change, prompt change, unknown, idle)
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

## Architecture

```
src/
├── monitor/          Real-time, event-driven
│   ├── monitor.ts    Extension factory
│   ├── state.ts      TurnRecord store + regression detection
│   └── status.ts     Footer status formatting
├── forensics/        Cross-session, query-driven
│   ├── forensics.ts  Scan pipeline (listAll → parse → extract → query)
│   ├── extract.ts    Cache turn extraction + timestamp-aligned tool windows
│   ├── queries.ts    Hotspots, breakdown, correlation, idle detection
│   ├── redact.ts     Shape fingerprinting + agent-safe output stripping
│   └── types.ts      ForensicsFinding, CauseBreakdown, ToolCallShape
├── report/           TUI rendering
│   ├── history.ts    /supi-cache-history table
│   └── forensics.ts  /supi-cache-forensics themed report
├── fingerprint.ts    Prompt component fingerprinting
├── config.ts         Shared config (supi-cache section)
├── settings-registration.ts
└── hash.ts           FNV-1a hashing
```

### Data flow

```
message_end → recordTurn() → appendEntry("supi-cache-turn")
     │                              │
     ▼                              ▼
 footer status ──────────── session JSONL file
     │
     ▼
 detectRegression() → notify
```

```
SessionManager.listAll()
       │
       ▼
 ┌────────────┐     ┌────────────┐     ┌────────────┐
 │  parse     │────▶│  extract   │────▶│   query    │
 │ session    │     │ turns +    │     │ hotspots,  │
 │ file       │     │ tool       │     │ breakdown, │
 └────────────┘     │ windows    │     │ correlate, │
                    └────────────┘     │ idle       │
                                       └────────────┘
                                              │
                                              ▼
                                       ┌────────────┐
                                       │ strip      │
                                       │ human      │
                                       │ detail     │
                                       └────────────┘
                                              │
                                              ▼
                                       JSON → agent
```

## Configuration

Settings are managed through `/supi-settings` under the **Cache** section, or via config files:

| Setting | Description | Default |
|---------|-------------|---------|
| `enabled` | Enable/disable monitoring | `on` |
| `notifications` | Show regression warning notifications | `on` |
| `regressionThreshold` | Percentage-point drop that triggers a warning and gates forensics findings | `25` |
| `idleThresholdMinutes` | Minutes of inactivity to classify as idle-time regression | `5` |

Config file locations:

- global: `~/.pi/agent/supi/config.json`
- project: `.pi/supi/config.json`

Use the `supi-cache` section. Upgrades from the old `cache-monitor` section are handled automatically.

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

## Agent safety

The `supi_cache_forensics` tool returns shape fingerprints, not raw content:

| If the agent sees | It does NOT see |
|---|---|
| `{ "toolName": "bash", "paramKeys": ["command"], "paramShapes": { "command": { "kind": "string", "len": 340, "multiline": true } } }` | The 340-char command text |
| `{ "toolName": "write", "paramKeys": ["file_path", "content"] }` | The file content or exact path |

Human-only detail (`_pathsInvolved`, `_commandSummaries`) is stripped before returning to the agent — the TUI renderer shows richer information.

## Requirements

- `@mariozechner/pi-ai`
- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-tui`
- `typebox`
- `@mrclrchtr/supi-core`

## Development

```bash
# Test
pnpm vitest run packages/supi-cache/

# Typecheck
pnpm exec tsc --noEmit -p packages/supi-cache/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-cache/__tests__/tsconfig.json

# Lint
pnpm exec biome check packages/supi-cache
```

## License

MIT
