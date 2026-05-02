## Context

`supi-core` already has a generic settings registry (`registerSettings`) and a generic UI (`openSettingsOverlay`) that passes the selected scope through to each section's `loadValues(scope, cwd)` callback. The bug we just hit was not in the UI itself; it was that config-backed sections in `supi-claude-md` and `supi-lsp` accidentally treated `loadValues(scope, cwd)` like a merged runtime-config loader instead of a raw selected-scope loader.

That duplication is easy to repeat because every config-backed section must currently remember three things on its own: load `defaults <- selected scope` for display, keep merged runtime config loaders for extension behavior, and wire scoped `writeSupiConfig` / `removeSupiConfigKey` calls for persistence.

## Goals / Non-Goals

**Goals:**
- Add a helper for SuPi config-backed settings sections that centralizes selected-scope loading and scoped persistence helpers.
- Preserve the existing generic registry and UI contracts.
- Migrate `supi-claude-md` and `supi-lsp` to the helper to remove duplicated boilerplate.
- Keep extension-owned string↔typed parsing and `SettingItem` definitions intact.

**Non-Goals:**
- Redesign `settings-ui.ts` to know about SuPi config files.
- Break or remove `registerSettings()`.
- Change merged runtime config loading used by extension runtime behavior.
- Solve test-only `HOME` override ergonomics in the helper API.

## Decisions

### 1. Add a config-aware helper instead of redesigning the core registry
Add a new helper (for example `registerConfigSettings`) in `supi-core` that wraps the existing `registerSettings()` primitive.

**Why:** This fixes the repeated footgun while preserving the generic registry as a reusable low-level API.

**Alternative considered:** Make `registerSettings()` itself config-aware. Rejected because it would permanently couple the registry to SuPi config semantics and make non-config-backed sections awkward later.

### 2. Keep `settings-ui.ts` generic
The helper will adapt config-backed sections into the existing `SettingsSection` contract, so `settings-ui.ts` continues to consume `getRegisteredSettings()` and `loadValues(scope, cwd)` without knowing how a section gets its values.

**Why:** The current UI already has the right abstraction boundary. The bug lives in section registration boilerplate, not in the overlay.

**Alternative considered:** Put scope-aware config loading directly into `settings-ui.ts`. Rejected because it would couple the UI to SuPi config and reduce registry flexibility.

### 3. Helper owns selected-scope loading and scoped persistence helpers
The helper should:
- load display config as `defaults <- selected scope`
- expose scoped persistence helpers like `set(key, value)` and `unset(key)` inside the extension's `persistChange` callback

Extensions remain responsible for:
- building `SettingItem[]`
- parsing string values back into typed config values
- any custom submenu behavior

**Why:** This removes the easy-to-forget plumbing while keeping extension-specific logic close to each package.

### 4. Migrate config-backed sections incrementally
Migrate `packages/supi-claude-md/settings-registration.ts` and `packages/supi-lsp/settings-registration.ts` to the helper, but keep their normal merged runtime loaders (for example `loadLspSettings(cwd)`) for non-UI runtime behavior.

**Why:** The UI and runtime have different semantics. The helper should improve UI correctness without changing extension runtime behavior.

## Risks / Trade-offs

- **[Extra abstraction]** → One more helper in `supi-core` adds API surface. **Mitigation:** Keep `registerSettings()` untouched and make the helper narrowly focused on config-backed sections.
- **[Over-generalizing too early]** → A helper that tries to own too much extension-specific parsing will become rigid. **Mitigation:** Keep item building and string↔typed parsing in the extension callback layer.
- **[Migration drift]** → One migrated package could still bypass the helper and reintroduce the bug pattern later. **Mitigation:** Cover the helper with tests and migrate the existing config-backed sections immediately.

## Migration Plan

1. Add the new config-backed helper to `supi-core` and export it from `index.ts`.
2. Add `supi-core` tests that verify selected-scope loading and scoped persistence behavior.
3. Migrate `supi-claude-md` to the helper.
4. Migrate `supi-lsp` to the helper.
5. Run targeted package tests and workspace verification.

## Open Questions

- Final helper name (`registerConfigSettings` vs `createConfigSettingsSection`) can be decided during implementation; the behavior matters more than the exact name.
