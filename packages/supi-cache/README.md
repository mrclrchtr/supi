# @mrclrchtr/supi-cache

Adds prompt-cache monitoring and cache-regression forensics to the [pi coding agent](https://github.com/earendil-works/pi).

## Install

```bash
pi install npm:@mrclrchtr/supi-cache
```

This is a **beta** package. Install individually.

For local development:

```bash
pi install ./packages/supi-cache
```

After editing the source, run `/reload`.

## What you get

After install, the package does two things:

1. **Monitor the current session**
   - records per-turn cache usage from assistant messages
   - updates a footer status for cache health
   - warns when the cache hit rate drops enough to count as a regression
   - tries to explain the drop as compaction, model change, prompt change, or unknown

2. **Investigate past sessions**
   - scans session files for cache regressions across time
   - groups findings into a few built-in query patterns
   - keeps agent-facing results redacted to structural fingerprints instead of raw command text or file paths

## Commands and tool

### `/supi-cache-history`

Shows cache history for the current session.

The report includes per-turn values for:

- input tokens
- cache read tokens
- cache write tokens
- hit rate
- notes about detected regressions

### `/supi-cache-forensics`

Runs a cross-session investigation.

Supported patterns:

- `breakdown` — count regressions by cause
- `hotspots` — show the largest drops
- `correlate` — show which preceding tool calls correlate with drops
- `idle` — show drops after long gaps between turns

Useful flags:

- `--since 7d`
- `--pattern breakdown`
- `--min-drop 20`

### `supi_cache_forensics`

Adds one model-callable tool with the same four patterns: `hotspots`, `breakdown`, `correlate`, and `idle`.

The tool returns JSON text. Before results are returned to the model, human-only details such as `_pathsInvolved` and `_commandSummaries` are stripped out.

## Settings

This package registers a **Cache** section in `/supi-settings`.

Available settings:

- `enabled` — turn monitoring on or off
- `notifications` — show warning notifications for regressions
- `regressionThreshold` — percentage-point drop that counts as a regression warning
- `idleThresholdMinutes` — inactivity gap used to classify idle-time regressions

Defaults:

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

The config loader also reads the legacy `cache-monitor` section for upgrades, but `supi-cache` is the current config section.

## Source

- `src/monitor/monitor.ts` — live monitoring, commands, and tool registration
- `src/forensics/forensics.ts` — cross-session scan pipeline
- `src/report/history.ts` — current-session history report
- `src/report/forensics.ts` — cross-session forensics report
