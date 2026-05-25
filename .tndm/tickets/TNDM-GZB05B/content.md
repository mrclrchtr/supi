# Plan: Restructure supi-core with domain-decomposed entry points

## Goal
Split `supi-core/src/api.ts` (a monolithic barrel exporting 90+ symbols from 12+ modules) into clean domain entry points so consumers only import the dependencies they actually need.

## Problem
Every test importing anything from `@mrclrchtr/supi-core/api` triggers a chain of transitive imports including `@earendil-works/pi-tui` (1.3–1.7s). This adds ~50% overhead to the vitest import phase (70s wall time).

## Solution: 11 domain entry points + convenience barrel

### New domain subpath exports

| Subpath | Maps to | Content | Heavy deps |
|---|---|---|---|
| `./config` | `src/config.ts` (new) | loadSupiConfig, loadSupiConfigForScope, readJsonFile, writeSupiConfig, removeSupiConfigKey, registerConfigSettings, ConfigSettingsHelpers, ConfigSettingsOptions, SupiConfigLocation, SupiConfigOptions | pi-core, fs |
| `./context` | `src/context.ts` (new) | wrapExtensionContext, getContextToken, getPromptContent, restorePromptContent, pruneAndReorderContextMessages, findLastUserMessageIndex, registerContextProvider, getRegisteredContextProviders, clearRegisteredContextProviders, ContextMessageLike, ContextProvider | pi-core, crypto |
| `./debug` | `src/debug-registry.ts` | All debug event recording/inspection types and functions | pi-core |
| `./path` | `src/path.ts` (new) | fileToUri, uriToFile, resolveToolPath, stripToolPathPrefix | pi-core |
| `./project` | `src/project.ts` (new) | findProjectRoot, walkProject, isWithin, isWithinOrEqual, dedupeTopmostRoots, buildKnownRootsMap, byPathDepth, mergeKnownRoots, resolveKnownRoot, segmentCount, sortRootsBySpecificity, KnownRootEntry | pi-core, fs, path |
| `./session` | `src/session.ts` (new) | getActiveBranchEntries, createRegistry, createSessionStateRegistry | pi-core |
| `./settings` | `src/settings.ts` (new) | registerSettings, getRegisteredSettings, clearRegisteredSettings, registerSettingsCommand, SettingsScope, SettingsSection | pi-tui (type-only) |
| `./settings-ui` | `src/settings-ui.ts` (new) | createInputSubmenu, openSettingsOverlay | **pi-tui (runtime)** |
| `./terminal` | `src/terminal.ts` (existing) | formatTitle, signalDone, signalWaiting, signalBell, DONE_SYMBOL, WAITING_SYMBOL, TitleTarget | pi-core |
| `./tool-framework` | `src/tool-framework.ts` (existing) | registerSuiPiTools, derivePromptSurface, SuiPiToolSpec, SuiPiToolPromptSurface, ToolExecuteFn, CharacterParam, FileParam, LineParam, MaxResultsParam, SymbolParam | pi-core, typebox |
| `./types` | `src/types.ts` (new) | CodeLocation, CodePosition | **none** |

### Convenience barrel (`./api`)
`src/api.ts` is rewritten as a thin re-export layer: one `export * from "./domain.ts"` per domain. Still works for consumers who need multiple domains, but no longer a God object.

### Added exports
- `./settings` — lightweight settings registry (replaces pi-tui-heavy `./api` import for most callers)
- `./settings-ui` — heavy, only imported by packages needing interactive settings submenus
- 9 other domain entry points for clean tree-shaking

### Removed from barrel
- No removals. All old exports remain available via `./api`. New code is encouraged to use domain entry points.

## Consumer migration map

| Package | Old `./api` imports | New imports |
|---|---|---|
| supi-ask-user | formatTitle, signalWaiting | `./terminal` |
| supi-bash-timeout | loadSupiConfig | `./config` |
| | createInputSubmenu, registerConfigSettings | `./config` + `./settings-ui` |
| | clearRegisteredSettings, getRegisteredSettings | `./settings` |
| supi-cache | loadSupiConfig, registerConfigSettings | `./config` |
| | getActiveBranchEntries | `./session` |
| supi-claude-md | loadSupiConfig, registerConfigSettings | `./config` |
| | createInputSubmenu | `./settings-ui` |
| | wrapExtensionContext | `./context` |
| supi-code-intelligence | findProjectRoot, walkProject, isWithinOrEqual | `./project` |
| | readJsonFile | `./config` |
| | resolveToolPath, uriToFile | `./path` |
| | CodeLocation, CodePosition | `./types` |
| supi-context | getRegisteredContextProviders | `./context` |
| supi-debug | debug types/functions | `./debug` |
| supi-extras | formatTitle, signalDone | `./terminal` |
| | readJsonFile | `./config` |
| supi-insights | loadSupiConfig, registerConfigSettings | `./config` |
| | getActiveBranchEntries | `./session` |
| supi-lsp | loadSupiConfigForScope | `./config` |
| | pruneAndReorderContextMessages, restorePromptContent | `./context` |
| | \* as projectRoots, findProjectRoot, walkProject, dedupeTopmostRoots | `./project` |
| | createSessionStateRegistry | `./session` |
| | registerSettings, getRegisteredSettings, clearRegisteredSettings | `./settings` |
| | formatTitle, signalDone, signalWaiting | `./terminal` |
| | fileToUri, uriToFile | `./path` |
| supi-rtk | registerConfigSettings, registerContextProvider | `./config` + `./context` |
| supi-tree-sitter | resolveToolPath | `./path` |
| | createSessionStateRegistry | `./session` |
| supi-core tests | (various) | Keep `./api` for now (tests use many symbols) |

## Expected outcome
- Vitest import phase: 70s → ~30–35s
- Total `pnpm test`: 20.4s → ~12–15s
- New code has clear domain boundaries, no accidental pi-tui imports
- All existing `./api` imports still work (backwards compat)
