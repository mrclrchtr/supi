# Extract /supi-settings into supi-settings, library-ify supi-core

## Problem

When installing 2+ SuPi packages that bundle `supi-core`, PI registers `/supi-settings` once per bundled copy, resulting in duplicate command entries (`supi-settings:1`, `supi-settings:2`, `supi-settings:3`). Each works identically but the command palette is polluted.

Root cause: `supi-core` conflates two roles:
- **Library** (config, settings registry, context tags, tool framework) — safe to bundle
- **Extension** (registers `/supi-settings` command) — must NOT be bundled N times

PI intentionally isolates packages with separate module roots, so each bundled copy of `supi-core` calls `pi.registerCommand("supi-settings", ...)` again. PI disambiguates with `:N` suffixes.

The settings **data** registry is already deduplicated via `globalThis` + `Symbol.for()`. Only the command registration fails to deduplicate.

13 packages currently bundle `supi-core`'s extension reference (`"node_modules/@mrclrchtr/supi-core/src/extension.ts"` in `pi.extensions`).

## Approach

Extract `/supi-settings` into a new thin package `@mrclrchtr/supi-settings`. `supi-core` drops its extension surface entirely and becomes a pure library. All 13 dependent packages drop the bundled extension reference but keep `supi-core` as a bundled library dependency.

## Changes by package

### 1. supi-core → library only

- `package.json`: Remove `pi` key entirely. Remove `"./extension"` from `exports`.
- `src/extension.ts`: Delete (2 lines, re-exports `registerSettingsCommand`).
- `src/settings/settings-command.ts`: Keep — already exported via `./settings`, becomes a library function.
- `CLAUDE.md`, `README.md`: Update extension references → library-only language.

### 2. supi-settings → new package

- Create `packages/supi-settings/` following standard small-package layout (`supi-bash-timeout` as template).
- `package.json`: depends on + bundles `supi-core`, `pi.extensions: ["./src/extension.ts"]`.
- `src/extension.ts`: imports `registerSettingsCommand` from `@mrclrchtr/supi-core/settings`, calls it.
- Includes `src/api.ts`, `src/index.ts`, `tsconfig.json`, `__tests__/tsconfig.json`, `vitest.config.ts`.
- `__tests__/unit/extension.test.ts`: verify command registration.

### 3. 13 dependent packages — mechanical change

Remove `"node_modules/@mrclrchtr/supi-core/src/extension.ts"` from `pi.extensions` in each `package.json`:
supi-ask-user, supi-bash-timeout, supi-cache, supi-claude-md, supi-code-intelligence, supi-context, supi-debug, supi-extras, supi-insights, supi-lsp, supi-rtk, supi-tree-sitter, supi-web

### 4. Root workspace

- `package.json` `pi.extensions`: replace `./packages/supi-core/src/extension.ts` with `./packages/supi-settings/src/extension.ts`.

### 5. Pack-staged test

- Update `scripts/__tests__/pack-staged.test.mjs` for all 13 changed `pi.extensions` arrays + add assertion for new `supi-settings`.

### 6. Docs

- `supi-core/CLAUDE.md`, `supi-core/README.md`: update extension references.
- Root `CLAUDE.md`: update `supi-core entry points` section.

## Migration impact

**Breaking for standalone installs.** Users who rely on bundled `supi-core` for `/supi-settings` must now install `supi-settings` explicitly. Mitigation: release notes.

**Dev workspace unaffected** — root `package.json` loads `supi-settings`; bundled refs in sub-packages don't matter in dev mode.

## Non-goals

- Not changing how other packages depend on `supi-core` as a library (dependencies + bundledDependencies stay).
- Not fixing `supi-lsp` / `supi-tree-sitter` bundling (each is bundled by only one package — no duplication yet).
- Not adding idempotency guards.

## Task list overview

1. Create `supi-settings` package scaffold
2. Write supi-settings extension + tests
3. Library-ify supi-core (remove extension surface)
4. Update all 13 dependent package.json files
5. Update root workspace package.json
6. Update pack-staged test assertions
7. Update docs (CLAUDE.md, README.md)
8. Full verification sweep
