# supi-debug

Session-local debug event capture, querying, and reporting for SuPi extensions.

## Ownership

Producers publish events through `supi-core`'s shared debug registry. This extension owns retention and agent-access policy, sanitized session persistence, and human reporting. Its context provider supplies the TUI context summary.

## Gotchas

- Agent access defaults to `sanitized`; raw data requires explicit opt-in via settings. Historical records are always sanitized.
- `operationId` is an optional top-level exact filter and display field. Retain it only when it has the validated Debug Operation ID form.
- A Debug Operation ID means explicit direct request ownership. It is not a security identity, distributed trace, raw Pi Tool-call identity, or time overlap.
- `applyDebugConfig()` must be called synchronously at extension load and on each `session_start` — config changes via settings also call `syncLiveDebugRegistry()` immediately.
- When debug is disabled, `clearDebugEvents()` is called to flush the buffer. Re-enabling starts fresh.
- `runtime-provenance` reads Git only when the package sits at `packages/<name>` of a checkout whose root `package.json` is `@mrclrchtr/supi-workspace`; otherwise a host repository's commit would be misattributed. Git failures omit fields, never fail `session_start`.

## Cache history and forensics (`src/cache/`, `src/tool/cache_forensics/`)

Merged from the former `supi-cache` package. PI owns live cache statistics, cache-miss notices, compaction notices, and provider recovery notices. Settings expose only forensics thresholds (`cache` section, registered as **Cache Forensics**). The `cache_forensics` tool is machine-only: it uses PI's transcript-rendering fallback, declares an output schema, and returns the same bounded public data as native `structuredContent` and direct-call JSON. List queries default to 50 findings, max 200.

- Native assistant message usage is the source of truth. Old `supi-cache-turn`
  entries are read only to retain legacy causes and prompt fingerprints.
- Native prompt tokens are `input + cacheRead + cacheWrite`, matching PI.
- A compaction or branch-summary entry resets the comparison window. A native
  `model_change` entry identifies the next model request.
- The native extractor does not compare persisted prompt sections/checkpoints.
  Prompt-component causes and fingerprints are retained only from legacy cache records.
- Forensics thresholds read the `cache` section, then the old `cache-monitor`
  section. The old `enabled` and `notifications` values are ignored. Configure
  live PI notices with `showCacheMissNotices`.
- Tool correlation uses native assistant timestamps, not assistant-message count.
- Tool result assembly allowlists public facts, including nested causes and
  redacted tool shapes. Human-only detail stays in command reports. Normalize
  before size checks; both tool representations use the same all-or-spill
  summary, and spill files contain the complete query-limited public result.
- Do not import PI's private `dist/core/cache-stats` module. It is not a public
  package export. Keep the native extraction adapter small and provider-neutral.
