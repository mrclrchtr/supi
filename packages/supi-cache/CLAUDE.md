# CLAUDE.md

## Scope

`@mrclrchtr/supi-cache` provides per-turn cache history and cross-session cache forensics. PI owns live cache statistics, cache-miss notices, compaction notices, and provider recovery notices.

## Architecture

```
src/
├── forensics/        Native session extraction, queries, reports, and extension wiring
│   ├── extension.ts  Commands, renderers, and tool registration
│   ├── extract.ts    Native assistant usage, legacy record migration, tool windows
│   ├── forensics.ts  SessionManager.listAll → parse → extract → query
│   ├── queries.ts    Pure query functions: hotspots, breakdown, correlate, idle
│   ├── redact.ts     Shape fingerprint computation and human-detail stripping
│   ├── turns.ts      Normalized cache turns and legacy cause helpers
│   └── types.ts      ForensicsFinding, CauseBreakdown, ToolCallShape, ParamShape
├── report/
│   ├── history.ts    /supi-cache-history — per-turn table
│   └── forensics.ts  /supi-cache-forensics — themed query views
├── tool/
│   └── cache_forensics/  prompt metadata, execution, result, and registration
├── fingerprint.ts    Prompt fingerprints retained for old monitor records
├── config.ts         Forensics thresholds with legacy config fallback
├── settings-registration.ts  Cache-forensics threshold settings
└── hash.ts           FNV-1a fast string hashing

Tests live in `__tests__/unit/`, mirroring the source domains.
```

The old live monitor, footer contribution, and notification path were removed
because PI now provides those surfaces. The settings module now exposes only
forensics thresholds.

## Commands and tool

| Surface  | Name | Purpose |
|----------|------|---------|
| Command  | `/supi-cache-history` | Per-turn cache usage table for the current branch |
| Command  | `/supi-cache-forensics` | Cross-session cache investigation |
| Tool     | `cache_forensics` | Agent-callable query with redacted shape fingerprints |

The `cache_forensics` tool is machine-only. List patterns return at most 50
findings by default and accept a limit up to 200. Its result is a bounded JSON
envelope for agent use. Human forensics output uses the command renderer.

## Key gotchas

- Native assistant message usage is the source of truth. Old `supi-cache-turn`
  entries are read only to retain legacy causes and prompt fingerprints.
- Native prompt tokens are `input + cacheRead + cacheWrite`, matching PI.
- A compaction or branch-summary entry resets the comparison window. A native
  `model_change` entry identifies the next model request.
- Native sessions cannot identify prompt-component changes because PI does not
  persist system-prompt fingerprints. Prompt-change details only remain for old
  records that contain them.
- Forensics thresholds read the `cache` section, then the old `cache-monitor`
  section. The old `enabled` and `notifications` values are ignored. Configure
  live PI notices with `showCacheMissNotices`.
- Tool correlation uses native assistant timestamps, not assistant-message count.
- The forensics engine strips `_prefixed` fields before returning results to the
  agent. These fields are for human report details only.
- Do not import PI's private `dist/core/cache-stats` module. It is not a public
  package export. Keep the native extraction adapter small and provider-neutral.
