## 1. Package scaffolding

- [x] 1.1 Create `packages/supi-core/` with `package.json` (name `@mrclrchtr/supi-core`, peer dep on `@mariozechner/pi-coding-agent`), `tsconfig.json`, and pi manifest
- [x] 1.2 Create `packages/supi-claude-md/` with `package.json` (name `@mrclrchtr/supi-claude-md`, dep on `@mrclrchtr/supi-core`, peer dep on `@mariozechner/pi-coding-agent`), `tsconfig.json`, and pi manifest
- [x] 1.3 Add `@mrclrchtr/supi-core` and `@mrclrchtr/supi-claude-md` as dependencies to `packages/supi/package.json` and wire the extensions entry
- [x] 1.4 Run `pnpm install` and verify `pnpm typecheck` passes with empty index files

## 2. supi-core: extension-context tag

- [x] 2.1 Implement `wrapExtensionContext(source, content, attrs?)` in `packages/supi-core/context-tag.ts`
- [x] 2.2 Write unit tests in `packages/supi-core/__tests__/context-tag.test.ts`: basic wrapping, with attributes, no attributes, attribute value coercion to string

## 3. supi-core: config system

- [x] 3.1 Implement `loadSupiConfig(section, cwd, defaults)` in `packages/supi-core/config.ts` — read global (`~/.pi/agent/supi/config.json`) and project (`.pi/supi/config.json`), merge defaults ← global ← project
- [x] 3.2 Implement `writeSupiConfig(section, scope, cwd, value)` — read-modify-write with directory creation
- [x] 3.3 Write unit tests in `packages/supi-core/__tests__/config.test.ts`: load with no files, global only, project only, merged, malformed JSON fallback, write creates dir/file, write merges existing
- [x] 3.4 Export public API from `packages/supi-core/index.ts`

## 4. supi-claude-md: config and types

- [x] 4.1 Define config interface and hardcoded defaults in `packages/supi-claude-md/config.ts` (`rereadInterval: 3`, `subdirs: true`, `compactRefresh: true`, `fileNames: ["CLAUDE.md", "AGENTS.md"]`)
- [x] 4.2 Define internal state types in `packages/supi-claude-md/state.ts` (`ClaudeMdState` with `completedTurns`, `lastRefreshTurn`, `injectedDirs`, `needsRefresh`, `currentContextToken`, `contextCounter`, `nativeContextPaths`)
- [x] 4.3 Write unit tests for config loading via `loadSupiConfig` in `packages/supi-claude-md/__tests__/config.test.ts`

## 5. supi-claude-md: context file discovery

- [x] 5.1 Implement `findSubdirContextFiles(filePath, cwd, fileNames)` in `packages/supi-claude-md/discovery.ts` — walk up from file dir to cwd, find first matching file name per directory
- [x] 5.2 Implement `filterAlreadyLoaded(found, nativeContextPaths)` — remove paths already loaded by pi
- [x] 5.3 Implement `extractPathFromToolEvent(toolName, input)` — extract file path from read/write/edit/ls/lsp tool inputs, return null for unsupported tools
- [x] 5.4 Write unit tests in `packages/supi-claude-md/__tests__/discovery.test.ts`: walk-up logic, stop at cwd, dedup, file name priority, custom file names, path extraction per tool, unsupported tool returns null
- [x] 5.5 Write filesystem integration tests: real directory trees with context files, verify correct discovery

## 6. supi-claude-md: subdirectory injection (tool_result)

- [x] 6.1 Implement `formatSubdirContext(files)` in `packages/supi-claude-md/subdirectory.ts` — format discovered context files using `wrapExtensionContext` with `file` and `turn` attributes
- [x] 6.2 Implement `shouldInjectSubdir(dir, injectedDirs, currentTurn, rereadInterval)` — return true if dir not yet injected or stale (turn delta >= interval)
- [x] 6.3 Wire `tool_result` handler in `packages/supi-claude-md/index.ts`: extract path, discover context files, check staleness, augment content, update tracking
- [x] 6.4 Write unit tests in `packages/supi-claude-md/__tests__/subdirectory.test.ts`: format output, staleness check, first injection, refresh after interval, skip within interval

## 7. supi-claude-md: root refresh (before_agent_start + context)

- [x] 7.1 Implement `shouldRefreshRoot(state, config)` in `packages/supi-claude-md/refresh.ts` — check turn interval, post-compaction flag, manual refresh flag
- [x] 7.2 Implement `formatRefreshContext(contextFiles)` — format root context files using `wrapExtensionContext`
- [x] 7.3 Implement `pruneStaleRefreshMessages(messages, activeToken)` — filter out old refresh messages, reorder current one before last user message (same pattern as supi-lsp's `reorderDiagnosticContextMessages`)
- [x] 7.4 Wire `before_agent_start` handler: check shouldRefreshRoot, read native context files from `event.systemPromptOptions.contextFiles`, return persistent message with `customType: "supi-claude-md-refresh"`, `display: false`, details with `contextToken` and `turn`
- [x] 7.5 Wire `context` event handler: call `pruneStaleRefreshMessages`, return modified messages
- [x] 7.6 Wire `turn_end` handler: increment `completedTurns` on `stopReason: "stop"`
- [x] 7.7 Wire `session_compact` handler: set `needsRefresh = true`, clear `injectedDirs`
- [x] 7.8 Write unit tests in `packages/supi-claude-md/__tests__/refresh.test.ts`: should-refresh logic (interval, post-compaction, manual), prune/reorder messages, format output

## 8. supi-claude-md: session state reconstruction

- [x] 8.1 Implement `reconstructState(branch, config)` in `packages/supi-claude-md/state.ts`
- [x] 8.2 Wire `session_start` handler: call `reconstructState`, populate native context paths from first `before_agent_start`
- [x] 8.3 Write unit tests in `packages/supi-claude-md/__tests__/state.test.ts`

## 9. supi-claude-md: deduplication with pi native

- [x] 9.1 Wire `before_agent_start` handler to read `event.systemPromptOptions.contextFiles` and update `nativeContextPaths` set
- [x] 9.2 Ensure `filterAlreadyLoaded` is called in the `tool_result` handler before injection
- [x] 9.3 Write unit tests: native paths excluded

## 10. supi-claude-md: /supi-claude-md command

- [x] 10.1 Register `/supi-claude-md` command with subcommand parsing in `packages/supi-claude-md/index.ts`
- [x] 10.2 Implement `status` subcommand: display effective config, completed turns, last refresh turn, injected dirs count
- [x] 10.3 Implement `refresh` subcommand: set `needsRefresh = true`, notify user
- [x] 10.4 Implement `list` subcommand: display all discovered subdirectory context files (scan cwd tree)
- [x] 10.5 Implement `interval <N|off|default>` subcommand: write to project or global config via `writeSupiConfig`
- [x] 10.6 Implement `subdirs on|off` subcommand: write to config
- [x] 10.7 Implement `compact on|off` subcommand: write to config
- [x] 10.8 Implement `--global` flag parsing: route config writes to global scope
- [x] 10.9 Implement argument autocompletion via `getArgumentCompletions`

## 11. supi-claude-md: CLAUDE.md

- [x] 11.1 Write `packages/supi-claude-md/CLAUDE.md` with package-specific guidance for agents working in the package

## 12. Integration and verification

- [x] 12.1 Run `pnpm typecheck` — all packages pass
- [x] 12.2 Run `pnpm test` — all tests pass
- [x] 12.3 Run `pnpm biome:ai` — no lint/format issues
- [x] 12.4 Manual smoke test: install SuPi in pi, verify subdirectory CLAUDE.md injection on file read
- [x] 12.5 Manual smoke test: verify root context refresh after 3 completed turns
- [x] 12.6 Manual smoke test: verify post-compaction refresh
- [x] 12.7 Manual smoke test: verify `/supi-claude-md status`, `interval`, `refresh`, `list` commands
