## Context

supi-lsp uses three environment variables (`PI_LSP_DISABLED`, `PI_LSP_SEVERITY`, `PI_LSP_SERVERS`) for user-facing settings with no persistence and no UI. supi-claude-md has a full settings UI built from 400+ lines of hand-rolled TUI code (manual row rendering, key dispatch, scope toggle). pi already ships `SettingsList` from `@mariozechner/pi-tui` — a reusable settings component with value cycling, descriptions, search, and submenu support. pi also provides `pi.events` for inter-extension communication. The supi shared config system (`supi-core/config.ts`) already handles global+project config merging for any section.

## Goals / Non-Goals

**Goals:**
- Provide a shared settings registry in supi-core where extensions declare their settings at startup
- Build a generic settings UI using pi-tui's `SettingsList` that renders all registered extensions
- Replace LSP env vars with persisted supi shared config
- Replace claude-md's custom settings UI with registry participation
- Provide a unified `/supi-settings` command with project/global scope toggle
- Support submenu for complex settings (e.g., server allowlist toggles)

**Non-Goals:**
- Changing `.pi-lsp.json` server definition format (that stays as-is for server commands, args, fileTypes, rootMarkers)
- Migration/compatibility for the old env vars (they're a supi-internal concern)
- Settings validation beyond what `SettingsList` provides
- Persisting settings outside the supi shared config system
- Per-extension scope (scope is per-session, applies to all edits)

## Decisions

### 1. Module-level Map in supi-core as registry

**Decision**: Use a module-level `Map<string, SettingsSection>` in `settings-registry.ts`. Extensions call `registerSettings()` during their factory function; the UI reads via `getRegisteredSettings()`.

**Rationale**: Extensions don't import each other — they're loaded independently by pi. A shared module in supi-core is the natural coordination point. Module-level state is simple, synchronous, and requires no event bus complexity.

**Alternative**: Use `pi.events` for registration (emit `supi:register-settings`, listen in supi-core). Rejected because it's async, order-dependent, and adds unnecessary indirection for what is effectively synchronous module state.

### 2. Reuse pi-tui `SettingsList` with extension grouping

**Decision**: Render settings using pi-tui's `SettingsList` component. Prefix each item's label with the extension name (e.g., "LSP: Enable LSP") or use section headers between groups.

**Rationale**: `SettingsList` already handles value cycling, descriptions, search, and submenu navigation. The current claude-md settings.ts is a hand-built version of this. Reusing it eliminates 400+ lines of custom code.

**Alternative**: Custom grouped layout with tabs per extension. Rejected — `SettingsList` with search and clear labeling is simpler and more consistent with pi's built-in `/tools` UI.

### 3. Scope toggle layered on top of SettingsList

**Decision**: Add a scope toggle (Tab key) outside the `SettingsList` component, similar to the current claude-md approach. The scope is per-session (project or global) and applies to all settings edits. When scope changes, the overlay rebuilds the entire `items` array by re-calling each extension's `loadValues` for the new scope, then creates a fresh `SettingsList`.

**Rationale**: `SettingsList` stores `currentValue` on each `SettingItem` — there's no bulk-update API. Rebuilding the list on scope toggle is the cleanest approach and is cheap (settings are small).

### 4. Server allowlist as submenu with toggle values

**Decision**: The LSP "Active Servers" setting uses `SettingItem.submenu` to open a child `SettingsList` showing all detected servers as enabled/disabled toggles. The persisted value is a string array of enabled server names.

**Rationale**: Comma-separated text input is error-prone and invisible. A toggle list per server is much better UX and matches what users expect from a settings UI.

### 5. Server allowlist source: defaults.json ∪ .pi-lsp.json

**Decision**: The server submenu shows all servers from the merged config (defaults + project overrides). Servers not in the allowlist config key are enabled by default (allowlist is opt-in filtering).

**Rationale**: Users shouldn't have to enumerate every server to use all of them. An empty/unset allowlist means "all servers enabled" — same as today's behavior when `PI_LSP_SERVERS` is unset.

### 6. Config shape for LSP in supi shared config

**Decision**: LSP settings live under `"lsp"` section in supi shared config:
```json
{
  "lsp": {
    "enabled": true,
    "severity": 1,
    "servers": ["typescript-language-server", "pyright"]
  }
}
```
An empty/missing `servers` array means all servers enabled.

**Rationale**: Consistent with claude-md's existing pattern. `severity` as number (1-4) matches LSP diagnostic severity levels.

### 7. `/supi-settings` registered via supi meta-package wrapper

**Decision**: supi-core provides `registerSettingsCommand(pi, ctx)` that registers the `/supi-settings` command and owns the UI. A thin wrapper extension in `packages/supi/settings.ts` imports and calls this function. The wrapper is listed in `packages/supi/package.json` pi.extensions. supi-core itself remains a library (`pi.extensions: []`).

**Rationale**: pi only loads extensions listed in `pi.extensions`. supi-core has no extension entrypoint and shouldn't gain one (it's a shared library). The meta-package (`packages/supi/`) is the natural place for the thin wiring. Extensions don't register their own settings commands.

### 8. Delete claude-md settings.ts and commands.ts entirely

**Decision**: Remove `settings.ts` (400+ lines), `commands.ts`, and the `/supi-claude-md` command registration from index.ts.

**Rationale**: The generic UI replaces all of this. No reason to keep the custom code.

### 9. Text-input submenus via custom Input component

**Decision**: Settings that need freeform text editing (e.g., claude-md file names, interval values) use `SettingItem.submenu` returning a custom `Component` wrapping pi-tui's `Input`. This is not a nested `SettingsList` — `SettingsList` only supports value cycling and toggles.

**Rationale**: `SettingsList` has no freeform text input mode. The submenu callback returns an arbitrary `Component`, so a small Input wrapper fits naturally. This is the same approach the current claude-md `settings.ts` uses for editing, but isolated to a ~30-line component instead of 400 lines.

### 10. String↔typed conversion lives in each extension

**Decision**: The registry and UI work entirely in strings (`SettingItem.currentValue` is always a string). Each extension's `loadValues` converts typed config values to display strings. Each extension's `persistChange` parses the string back to the typed value before writing to config. The registry never converts.

**Rationale**: Keeps the registry type-agnostic and simple. Extensions already know their own types. Centralized conversion would require a type system in the registry, adding complexity for no gain.

### 11. Server allowlist filtering in lsp.ts, not loadConfig()

**Decision**: `loadConfig()` in `config.ts` remains responsible for server definitions only (defaults + `.pi-lsp.json` merge). The allowlist filter is applied in `lsp.ts` after reading `enabled`/`severity`/`servers` from supi shared config. `config.ts` does not import from supi-core.

**Rationale**: Keeps server-definition loading separate from user settings. `loadConfig()` is a pure function that merges configs — adding supi-core as a dependency would couple it to the settings system unnecessarily.

## Risks / Trade-offs

- **Load order sensitivity** → Extensions must call `registerSettings()` during their factory function (not in async event handlers). If they register late, the settings UI won't show them until `/supi-settings` is opened again. Mitigation: document this clearly, assert in registry if called too late.
- **SettingsList may not perfectly match current claude-md UX** → The current UI has interval-specific input validation (number, "off", "default"). With `SettingsList` we'll use `submenu` for text input fields. Minor UX difference. Mitigation: acceptable trade-off for eliminating 400+ lines of custom code.
- **Server submenu needs detected server list at render time** → The server submenu must read the current server config when opened. If LSP hasn't scanned yet, the list may be incomplete. Mitigation: read from the merged config (defaults + .pi-lsp.json) which is always available, not from runtime detection.
- **No backward compat for env vars** → Removing env vars is a breaking change for anyone using them. Mitigation: env vars are a supi-internal concern, not a public API. Users migrate to the config file which is better UX (persistent, has UI).
