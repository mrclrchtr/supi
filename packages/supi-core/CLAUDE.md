# CLAUDE.md

## Scope

`@mrclrchtr/supi-core` is a pure library package. It provides shared config, context, settings, project-root helpers, and the shared tool-spec/registration framework. There is no pi extension — the `/supi-settings` command is now registered by `@mrclrchtr/supi-settings`.

Other SuPi packages should import the library surface via `@mrclrchtr/supi-core/api`.

## Source layout (domain-first)

```text
src/
  api.ts              — public export surface
  index.ts            — public export surface (identical to api.ts)
  debug-registry.ts   — debug event registry (flat utility)
  llm.ts              — shared LLM utilities (withRetry, callWithJsonResponse)
  path-utils.ts       — shared tool-path and file-URI normalization helpers
  progress-widget.ts  — generic TUI progress widget
  project-roots.ts    — directory walking, root discovery (flat utility)
  registry-utils.ts   — globalThis-backed shared registries, including session-state helpers (flat utility)
  session-utils.ts    — session utilities (flat utility)
  terminal.ts         — terminal formatting utilities (flat utility)
  tool-framework.ts   — shared tool-spec/registration framework + runWithProgressWidget
  config/
    config.ts         — loadSupiConfig*(), writeSupiConfig(), removeSupiConfigKey()
    config-settings.ts — registerConfigSettings() helper
  context/
    context-messages.ts   — context token/prompt-content helpers
    context-provider-registry.ts — context provider registry
    context-tag.ts        — extension-context wrapping
  settings/
    settings-registry.ts — global settings registry
    settings-command.ts  — /supi-settings command wiring
    settings-ui.ts       — settings overlay and submenu UI
```

## Test layout

```text
__tests__/
  unit/
    config/             — tests for src/config/*
    context/            — tests for src/context/*
    settings/           — tests for src/settings/*
    debug-registry.test.ts
    path-utils.test.ts
    project-roots.test.ts
    registry-utils.test.ts
    session-utils.test.ts
    terminal.test.ts
    tool-framework.test.ts
```

### Key paths

- `api.ts`, `index.ts` — public export surface; keep the shared API deliberate and small
- `path-utils.ts` — preferred shared location for leading `@` stripping, cwd resolution, and file URI conversion used across SuPi tool packages
- `registry-utils.ts` — preferred shared location for global registries and normalized-cwd session-state registries used by peer substrate packages
- `llm.ts` — shared LLM utilities: `withRetry()` (exponential-backoff retry with AbortSignal), `extractJsonFromResponse()`, `callWithJsonResponse()` (model resolution → completion → JSON extraction → TypeBox validation)
- `progress-widget.ts` — generic `ProgressWidget` for long-running TUI operations (used by `runWithProgressWidget`)
- `tool-framework.ts` — shared `SuiPiToolSpec`, `SuiPiToolPromptSurface`, `derivePromptSurface()`, `registerSuiPiTools()`, `runWithProgressWidget()`, and shared TypeBox param builders (`FileParam`, `LineParam`, etc.) for SuPi tool packages; packages keep their own execute logic

## Config gotchas

- Resolution order is `defaults <- global <- project`.
- `loadSupiConfigForScope()` is for settings UIs that need raw scope values; `loadSupiConfig()` is for effective merged runtime config.
- Config merges are shallow per section; do not assume nested objects deep-merge.
- In tests, pass `homeDir` instead of trying to mock `os.homedir()`.
- `registerConfigSettings()` forwards `homeDir` through to scoped config loads and writes; prefer passing `homeDir` in tests over mutating `process.env.HOME`.

## Shared behavior gotchas

- The settings registry lives on `globalThis` with `Symbol.for("@mrclrchtr/supi-core/settings-registry")` so registrations survive jiti/symlinked duplicate module instances.
- `createSessionStateRegistry()` is the shared helper for workspace-keyed session state; substrate packages should keep package-specific state unions and wait semantics local, and share only the normalized-cwd storage plumbing.
- Call `registerSettings()` during the extension factory function, not async handlers.
- `settings-ui.ts` prefixes flat item ids with `section.id` to avoid collisions, then strips the prefix before calling `persistChange()`.
- `registerConfigSettings()` wraps `registerSettings()` and owns selected-scope loading (`loadSupiConfigForScope`) and scoped persistence (`set`/`unset` helpers); extensions only build `SettingItem[]` and handle string↔typed parsing.
- Adding a new runtime export to `supi-core/index.ts` requires updating every `vi.mock("@mrclrchtr/supi-core")` factory in downstream test files; missing exports cause cryptic "No X export is defined on the mock" errors.
- Extensions using custom message renderers should keep display text in `content` and raw model text in `details.promptContent`; `restorePromptContent()` swaps the raw text back before the model sees it.
- `pruneAndReorderContextMessages()` keeps only the active token for a `customType` and moves the live context message before the last user message.
- `walkProject()` intentionally skips `node_modules`, `.git`, and `.pnpm`.

