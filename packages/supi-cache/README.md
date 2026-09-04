<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-cache">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-cache/assets/social-preview.png" alt="SuPi Cache" width="100%">
  </a>
</div>

# @mrclrchtr/supi-cache

[![GitHub stars](https://img.shields.io/github/stars/mrclrchtr/supi)](https://github.com/mrclrchtr/supi/stargazers) [![npm downloads](https://img.shields.io/npm/dm/@mrclrchtr/supi-cache)](https://www.npmjs.com/package/@mrclrchtr/supi-cache)

Adds per-turn prompt-cache history and cross-session cache forensics to the [pi coding agent](https://github.com/earendil-works/pi).

PI provides live cache statistics and cache-miss notices. Enable its transcript notices with `showCacheMissNotices` in PI settings. This package does not add a second live monitor or a second notification path.

## Install

```bash
pi install npm:@mrclrchtr/supi-cache
```

This is a **beta** package. Install it individually.

For local development:

```bash
pi install ./packages/supi-cache
```

## What you get

After install, the package provides two views:

1. **Current-branch history**
   - reads usage from native PI assistant messages
   - shows input, cache reads, cache writes, and hit rate for each request
   - keeps old prompt-change notes and fingerprints when they exist

2. **Historical forensics**
   - scans active branches across past sessions
   - finds cache hotspots and idle-time drops
   - groups model changes, compactions, branch summaries, prompt changes, and unknown causes
   - correlates drops with redacted tool-call shapes

![Cache history report](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-cache-history.png)

## Commands and tool

### `/supi-cache-history`

Shows per-turn cache usage for the current branch.

The report includes:

- input tokens
- cache-read tokens
- cache-write tokens
- cache hit rate
- known cause notes from current or old session records

### `/supi-cache-forensics`

Runs a cross-session investigation.

Supported patterns:

- `breakdown` — count findings by cause
- `hotspots` — show the largest hit-rate drops
- `correlate` — show preceding redacted tool shapes, ranked by hit-rate drop
- `idle` — show drops after long gaps between requests

Useful flags:

- `--since 7d`
- `--pattern breakdown`
- `--min-drop 20`
- `--limit 50` (maximum findings returned; list patterns default to 50)

![Cache forensics report](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-cache-forensics.png)

### `cache_forensics`

Adds one model-callable tool with the same four patterns. The result uses structural tool fingerprints and removes raw command and path details before it reaches the model.

List patterns return at most 50 findings by default. Use the tool's `limit` parameter, or the command's `--limit` flag, to request up to 200 findings. Hotspots exclude structural events with no measurable drop. The result is also bounded to 2,000 lines or 51,200 bytes. Large results are written to a private temporary file and return a summary envelope.

## Configuration

Forensics reads these optional values from the `cache` section. They are also available in `/supi-settings` under **Cache Forensics**:

```json
{
  "cache": {
    "regressionThreshold": 25,
    "idleThresholdMinutes": 5
  }
}
```

The loader also reads these two values from the old `cache-monitor` section. Old `enabled` and `notifications` values are ignored. Configure live PI cache notices with PI's `showCacheMissNotices` setting.

## Native session data

Native assistant-message usage is the source of truth. The package also reads old `supi-cache-turn` custom entries so old sessions keep their prompt-change details. New sessions do not create custom cache records.

## Source

- `src/forensics/extension.ts` — commands, renderers, and tool registration
- `src/forensics/extract.ts` — native usage extraction and legacy migration
- `src/forensics/forensics.ts` — cross-session scan pipeline
- `src/report/history.ts` — current-branch history report
- `src/report/forensics.ts` — cross-session forensics report
- `src/tool/cache_forensics/` — agent tool
