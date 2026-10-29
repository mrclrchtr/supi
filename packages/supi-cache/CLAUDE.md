# CLAUDE.md

## Scope

`@mrclrchtr/supi-cache` provides per-turn cache history and cross-session cache forensics. PI owns live cache statistics, cache-miss notices, compaction notices, and provider recovery notices.

## Ownership and output

SuPi settings expose only forensics thresholds.

Cache history reads the current branch; forensics investigates historical sessions. The agent tool is machine-only: it intentionally uses PI's transcript-rendering fallback, not `model-only` exposure. It declares an output schema and returns the same bounded public data as native `structuredContent` and direct-call JSON. Human reports use command renderers. List queries default to at most 50 findings and accept a limit up to 200.

## Key gotchas

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
