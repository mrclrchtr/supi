# CLAUDE.md

## Scope

`@mrclrchtr/supi-core` now has two explicit surfaces:
- `src/api.ts` — shared config/context/settings/project-root library helpers
- `src/extension.ts` — minimal pi extension registering `/supi-settings`

Other SuPi packages should import the library surface via `@mrclrchtr/supi-core/api`. PI discovery still uses the real file path `./src/extension.ts` from `package.json`.

## Commands

```bash
pnpm vitest run packages/supi-core/
pnpm exec tsc --noEmit -p packages/supi-core/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-core/__tests__/tsconfig.json
pnpm exec biome check packages/supi-core/
```

## Source layout (domain-first)

```text
src/
  api.ts              — public export surface
  index.ts            — public export surface (identical to api.ts)
  extension.ts        — minimal pi extension registering /supi-settings
  debug-registry.ts   — debug event registry (flat utility)
  project-roots.ts    — directory walking, root discovery (flat utility)
  registry-utils.ts   — globalThis-backed shared registry (flat utility)
  session-utils.ts    — session utilities (flat utility)
  terminal.ts         — terminal formatting utilities (flat utility)
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
    project-roots.test.ts
    session-utils.test.ts
    terminal.test.ts
```

### Key paths

- `api.ts`, `index.ts` — public export surface; keep the shared API deliberate and small

## Config gotchas

- Resolution order is `defaults <- global <- project`.
- `loadSupiConfigForScope()` is for settings UIs that need raw scope values; `loadSupiConfig()` is for effective merged runtime config.
- Config merges are shallow per section; do not assume nested objects deep-merge.
- In tests, pass `homeDir` instead of trying to mock `os.homedir()`.
- `registerConfigSettings()` forwards `homeDir` through to scoped config loads and writes; prefer passing `homeDir` in tests over mutating `process.env.HOME`.

## Shared behavior gotchas

- `@mrclrchtr/supi-core/extension` registers only `/supi-settings`; the meta-package aggregated extension invokes it as part of the Production bundle.
- The settings registry lives on `globalThis` with `Symbol.for("@mrclrchtr/supi-core/settings-registry")` so registrations survive jiti/symlinked duplicate module instances.
- Call `registerSettings()` during the extension factory function, not async handlers.
- `settings-ui.ts` prefixes flat item ids with `section.id` to avoid collisions, then strips the prefix before calling `persistChange()`.
- `registerConfigSettings()` wraps `registerSettings()` and owns selected-scope loading (`loadSupiConfigForScope`) and scoped persistence (`set`/`unset` helpers); extensions only build `SettingItem[]` and handle string↔typed parsing.
- Adding a new runtime export to `supi-core/index.ts` requires updating every `vi.mock("@mrclrchtr/supi-core")` factory in downstream test files; missing exports cause cryptic "No X export is defined on the mock" errors.
- Extensions using custom message renderers should keep display text in `content` and raw model text in `details.promptContent`; `restorePromptContent()` swaps the raw text back before the model sees it.
- `pruneAndReorderContextMessages()` keeps only the active token for a `customType` and moves the live context message before the last user message.
- `walkProject()` intentionally skips `node_modules`, `.git`, and `.pnpm`.

