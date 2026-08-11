# CLAUDE.md

## Scope

`@mrclrchtr/supi-core` is a pure library package. It provides shared config, context, settings, project-root helpers, and prompt-surface resolution. There is no pi extension. `@mrclrchtr/supi-settings` owns the `/supi-settings` command and its TUI.

Other SuPi packages should import the library surface via `@mrclrchtr/supi-core/api`.

## Source layout (domain-first)

```text
src/
  api.ts              — public export surface
  index.ts            — public export surface (identical to api.ts)
  debug-registry.ts   — public debug surface, event state, retention, redaction, and queries
  debug-timing.ts     — monotonic one-shot debug timers
  llm.ts              — shared LLM utilities (withRetry, callWithJsonResponse)
  path-utils.ts       — shared tool-path and file-URI normalization helpers
  report.ts           — shared text/report rendering helpers
  project-roots.ts    — directory walking, root discovery (flat utility)
  prompt-surface.ts   — configurable tool prompt-surface package boundary
  registry-utils.ts   — globalThis-backed shared registries, including session-state helpers (flat utility)
  session-utils.ts    — session utilities (flat utility)
  terminal.ts         — terminal formatting utilities (flat utility)
  config/
    config.ts         — loadSupiConfig*(), writeSupiConfig(), removeSupiConfigKey()
    prompt-surface.ts — trusted configurable tool prompt-surface resolution
  context/
    context-provider-registry.ts — context provider registry
    context-tag.ts        — extension-context wrapping
  settings/
    settings-registry.ts    — settings contribution collector protocol
    settings-schema.ts      — defineConfigSettings() and source-aware field resolution
```

### Key paths

- `api.ts`, `index.ts` — public export surface; keep the shared API deliberate and small
- `settings/` — data and persistence seam used by the TUI in `@mrclrchtr/supi-settings`
- `path-utils.ts` — preferred shared location for leading `@` stripping, cwd resolution, and file URI conversion used across SuPi tool packages
- `report.ts` — preferred shared location for reusable themed report/text helpers such as section headers, preview overflow hints, key/value rows, and wrapped report blocks
- `registry-utils.ts` — preferred shared location for global registries and normalized-cwd session-state registries used by peer substrate packages
- `debug-registry.ts` — stable `@mrclrchtr/supi-core/debug` domain surface plus Debug Registry state, retention, redaction, listeners, and queries; producers own event meaning while `supi-debug` owns retention and display policy
- `debug-timing.ts` — `startDebugTimer()` for one-shot total and sequential phase timings; the timer is a no-op when Debug is disabled, and a `finish()` factory prevents event-data construction on disabled hot paths
- `llm.ts` — shared LLM utilities: `withRetry()` (exponential-backoff retry with AbortSignal), `extractJsonFromResponse()`, `callWithJsonResponse()` (model resolution → completion → JSON extraction → TypeBox validation)
- `prompt-surface.ts` — configurable tool prompt-surface resolution and its public types

## Config gotchas

- Resolution order is `defaults <- global <- project`.
- `loadSupiConfigForScope()` is for settings UIs that need raw scope values; `loadSupiConfig()` is for effective merged runtime config.
- Config merges are shallow per section; do not assume nested objects deep-merge.
- In tests, pass `homeDir` instead of trying to mock `os.homedir()`.
- `defineConfigSettings()` forwards `homeDir` through to scoped config loads and writes; prefer passing `homeDir` in tests over mutating `process.env.HOME`.

## Shared behavior gotchas

- The settings registry lives on `globalThis` with `Symbol.for("@mrclrchtr/supi-core/settings-registry")` so registrations survive jiti/symlinked duplicate module instances.
- `createSessionStateRegistry()` is the shared helper for workspace-keyed session state; substrate packages should keep package-specific state unions and wait semantics local, and share only the normalized-cwd storage plumbing.
- Call `registerSettings()` during the extension factory function. Reads and writes happen later through the registered module.
- `settings-schema.ts` adapts fixed SuPi config to `SettingsModule`; it owns source resolution (`project`/`global`/`default`), typed parsing, scoped writes, Unset deletion, and structured `afterPersist` notifications.
- `modelPicker` fields include `disabled` by default; use `staticOptions` for host-owned sentinels and `includeDisabled: false` when disabling is not valid.
- `ScopedFieldValue.displayValue` includes the source badge for rendering; use `editValue` for editor prefills and concrete-choice comparisons. Do not parse the badge back out of display text.
- Adding a new runtime export to `supi-core/index.ts` requires updating every `vi.mock("@mrclrchtr/supi-core")` factory in downstream test files; missing exports cause cryptic "No X export is defined on the mock" errors.
- `walkProject()` intentionally skips `node_modules`, `.git`, and `.pnpm`.

