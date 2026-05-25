# Task 1: Create 8 domain barrel files in supi-core/src/

Create thin re-export files that map domain subpaths to existing source modules.

### New files

1. **`packages/supi-core/src/config.ts`** — re-exports from `./config/config.ts` (loadSupiConfig, loadSupiConfigForScope, readJsonFile, writeSupiConfig, removeSupiConfigKey, SupiConfigLocation, SupiConfigOptions) and `./config/config-settings.ts` (registerConfigSettings, ConfigSettingsHelpers, ConfigSettingsOptions)

2. **`packages/supi-core/src/context.ts`** — re-exports from `./context/context-messages.ts` (getContextToken, getPromptContent, restorePromptContent, pruneAndReorderContextMessages, findLastUserMessageIndex, ContextMessageLike), `./context/context-provider-registry.ts` (registerContextProvider, getRegisteredContextProviders, clearRegisteredContextProviders, ContextProvider), and `./context/context-tag.ts` (wrapExtensionContext)

3. **`packages/supi-core/src/path.ts`** — re-exports from `./path-utils.ts` (fileToUri, uriToFile, resolveToolPath, stripToolPathPrefix)

4. **`packages/supi-core/src/project.ts`** — re-exports from `./project-roots.ts` (findProjectRoot, walkProject, isWithin, isWithinOrEqual, dedupeTopmostRoots, buildKnownRootsMap, byPathDepth, mergeKnownRoots, resolveKnownRoot, segmentCount, sortRootsBySpecificity, KnownRootEntry)

5. **`packages/supi-core/src/session.ts`** — re-exports from `./session-utils.ts` (getActiveBranchEntries) and `./registry-utils.ts` (createRegistry, createSessionStateRegistry)

6. **`packages/supi-core/src/settings.ts`** — re-exports from `./settings/settings-registry.ts` (registerSettings, getRegisteredSettings, clearRegisteredSettings, SettingsScope, SettingsSection) **and** `./settings/settings-command.ts` (registerSettingsCommand). This entry point has `import type { SettingItem }` from pi-tui — zero runtime cost.

7. **`packages/supi-core/src/settings-ui.ts`** — re-exports from `./settings/settings-ui.ts` (createInputSubmenu, openSettingsOverlay). **This is the only entry point that triggers pi-tui runtime loading.**

8. **`packages/supi-core/src/types.ts`** — re-exports from `./substrate-types.ts` (CodeLocation, CodePosition). Pure types, zero dependencies.

### Verification
- Run `tsc -b packages/*/tsconfig.json packages/*/__tests__/tsconfig.json` — must pass
- Run `pnpm test -t "substrate"` — internal tests for type imports must pass
