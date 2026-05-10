# CLAUDE.md

This file provides guidance to Claude Code when working in `packages/supi-core/`.

## Scope

`@mrclrchtr/supi-core` is a shared library package, not a standalone pi extension. It provides:
- shared config read/write helpers
- XML `<extension-context>` wrapping and managed context-message helpers
- the shared settings registry/UI behind `/supi-settings`
- project-root/path helpers reused by `supi-lsp`

Other SuPi packages depend on `supi-core` for shared infrastructure; it is imported at runtime, not wired as a pi extension itself.

## Commands

```bash
pnpm vitest run packages/supi-core/
pnpm exec tsc --noEmit -p packages/supi-core/tsconfig.json
pnpm exec biome check packages/supi-core/
```

## Key files

- `index.ts` — public export surface; keep the shared API deliberate and small
- `config.ts` — `loadSupiConfig*()`, `writeSupiConfig()`, `removeSupiConfigKey()`
- `context-tag.ts`, `context-messages.ts` — extension-context wrapping plus context token/prompt-content helpers used by `supi-claude-md` and `supi-lsp`
- `settings-registry.ts`, `settings-ui.ts`, `settings-command.ts` — global settings registry, overlay, and `/supi-settings` command wiring
- `config-settings.ts` — `registerConfigSettings()` helper for config-backed settings sections (selected-scope loading + scoped persistence)
- `project-roots.ts` — directory walking, marker-based root discovery, and root dedupe/specificity helpers

## Config gotchas

- Resolution order is `defaults <- global <- project`.
- `loadSupiConfigForScope()` is for settings UIs that need raw scope values; `loadSupiConfig()` is for effective merged runtime config.
- Config merges are shallow per section; do not assume nested objects deep-merge.
- In tests, pass `homeDir` instead of trying to mock `os.homedir()`.
- `registerConfigSettings()` forwards `homeDir` through to scoped config loads and writes; prefer passing `homeDir` in tests over mutating `process.env.HOME`.

## Shared behavior gotchas

- `@mrclrchtr/supi-core` does not register a pi extension by itself; `packages/supi/settings.ts` re-exports `registerSettingsCommand()` for the meta-package.
- The settings registry lives on `globalThis` with `Symbol.for("@mrclrchtr/supi-core/settings-registry")` so registrations survive jiti/symlinked duplicate module instances.
- Call `registerSettings()` during the extension factory function, not async handlers.
- `settings-ui.ts` prefixes flat item ids with `section.id` to avoid collisions, then strips the prefix before calling `persistChange()`.
- `registerConfigSettings()` wraps `registerSettings()` and owns selected-scope loading (`loadSupiConfigForScope`) and scoped persistence (`set`/`unset` helpers); extensions only build `SettingItem[]` and handle string↔typed parsing.
- Adding a new runtime export to `supi-core/index.ts` requires updating every `vi.mock("@mrclrchtr/supi-core")` factory in downstream test files; missing exports cause cryptic "No X export is defined on the mock" errors.
- Extensions using custom message renderers should keep display text in `content` and raw model text in `details.promptContent`; `restorePromptContent()` swaps the raw text back before the model sees it.
- `pruneAndReorderContextMessages()` keeps only the active token for a `customType` and moves the live context message before the last user message.
- `walkProject()` intentionally skips `node_modules`, `.git`, and `.pnpm`.

## Validation

- `pnpm exec biome check packages/supi-core && pnpm vitest run packages/supi-core/ && pnpm exec tsc --noEmit -p packages/supi-core/tsconfig.json`
