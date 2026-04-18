## 1. Remove bash-guard and steer nudge

- [x] 1.1 Delete `bash-guard.ts` and `bash-guard-directory.ts`
- [x] 1.2 Delete all bash-guard tests from `__tests__/bash-guard.test.ts` (and integration tests if any)
- [x] 1.3 Remove `sendMessage`/steer nudge from `tool_result` handler in `lsp.ts` (the `shouldSuggestLsp` call and surrounding logic)
- [x] 1.4 Remove `initBashParser()` call from `session_start` handler in `lsp.ts`
- [x] 1.5 Remove `tree-sitter-bash` and `web-tree-sitter` from `package.json` dependencies and run `pnpm install`

## 2. Remove reactive tracking and recent-paths

- [x] 2.1 Delete `runtime-state.ts`
- [x] 2.2 Delete `recent-paths.ts`
- [x] 2.3 Remove all recent-paths state from `lsp.ts` (`recentPaths`, `persistedRecentPaths`, `currentRelevantPaths`, `currentGuidanceToken`, `guidanceCounter`, `refreshRelevantPaths()`)
- [x] 2.4 Remove recent-path tracking callbacks from `overrides.ts` (`recordRecentPath`, `getRecentPaths`, `setRecentPaths`, `onRecentPathsChange` in `LspOverrideState`)
- [x] 2.5 Remove `restoreRecentPaths` and `persistRecentPaths` calls from `session_start` and `turn_end` handlers
- [x] 2.6 Remove old guidance functions from `guidance.ts` (`buildRuntimeLspGuidance`, `runtimeGuidanceFingerprint`, `computeTrackedDiagnosticsSummary`, `extractPromptPathHints`, `mergeRelevantPaths`, `filterLspGuidanceMessages` and helpers)
- [x] 2.7 Delete or update tests in `__tests__/guidance.test.ts` that test removed functions

## 3. Implement proactive scanner

- [x] 3.1 Create `scanner.ts` with `scanProjectCapabilities(config, cwd)` function: scan rootMarkers (depth 3, exclude `node_modules`/`.git`), check `commandExists`, return matched servers with roots and file types
- [x] 3.2 Implement topmost-root deduplication: sort by path length ascending, skip children of accepted roots
- [x] 3.3 Add `startDetectedServers(manager, scanResults)` function: start all matched servers in parallel via `getClientForFile` or direct `LspClient` creation, handle startup failures gracefully
- [x] 3.4 Add `introspectCapabilities(manager, scanResults)` function: after servers start, read `ServerCapabilities` to determine supported actions per server
- [x] 3.5 Write unit tests for scanner: rootMarker detection, topmost-root dedup, multi-root scenarios, missing binaries, ignored directories

## 4. Implement project-specific promptGuidelines

- [x] 4.1 Add `buildProjectGuidelines(scanResults, capabilities)` function in `guidance.ts`: format server name, root, file types, and supported actions (with parameter hints) into `promptGuidelines` array
- [x] 4.2 Include fallback guideline ("Fall back to bash/read when file type not listed above")
- [x] 4.3 Wire into `session_start`: scan → start servers → introspect capabilities → re-register `lsp` tool with updated `promptGuidelines`
- [x] 4.4 Ensure re-registration triggers `refreshTools()` → `_rebuildSystemPrompt()` → stable `_baseSystemPrompt`
- [x] 4.5 Verify `before_agent_start` never returns `{ systemPrompt }` (prompt caching guarantee)
- [x] 4.6 Write unit tests for `buildProjectGuidelines`: single server, multi-server, missing capabilities, no servers detected

## 5. Implement diagnostic context injection

- [x] 5.1 Add `formatDiagnosticsContext(diagnostics)` function in `guidance.ts`: format outstanding diagnostics into `<extension-context source="supi-lsp">` XML-wrapped content
- [x] 5.2 Add diagnostic fingerprinting: hash the diagnostic summary string, store last injected fingerprint, skip injection when unchanged
- [x] 5.3 Wire into `before_agent_start`: collect diagnostics from all running servers, check fingerprint, return `{ message: { customType: "lsp-context", display: false, content } }` only when diagnostics exist and changed
- [x] 5.4 Add `ctx.ui.notify()` call when diagnostic context is injected
- [x] 5.5 Write unit tests for `formatDiagnosticsContext`: single file, multiple files, severity filtering, empty diagnostics

## 6. Implement context event reordering

- [x] 6.1 Replace existing `context` event handler: find `lsp-context` message, move before the last user message (prepend)
- [x] 6.2 Filter stale `lsp-context` messages from previous prompts (keep only current)
- [x] 6.3 Write unit tests for reordering: message with diagnostics, no diagnostics, multiple stale messages, no user message edge case

## 7. Update /lsp-status overlay and status bar

- [x] 7.1 Update `updateLspUi()` to accept scan results and show server info even with 0 open files (server name, root, file types, supported actions, status)
- [x] 7.2 Update status bar (`buildLspStatus`) to show server count from scan data when servers are running but no files are open
- [x] 7.3 Update overlay (`buildLspInspectorContainer`) to show scan-derived server info (roots, file types, capabilities) alongside existing open-files and diagnostics sections
- [x] 7.4 Handle "no servers detected" state in overlay ("no LSP servers available for this project")
- [x] 7.5 Handle server startup failure state in overlay (show as unavailable with root and file types)

## 8. Wire session lifecycle

- [x] 8.1 Update `session_start` handler: scan → start servers → introspect → re-register tool → update UI
- [x] 8.2 Ensure `/reload` triggers full re-scan (shutdown existing servers, re-scan, re-start, re-register)
- [x] 8.3 Update `session_shutdown` handler: ensure eager-started servers are shut down
- [x] 8.4 Update `agent_end` handler: clean up per-prompt state (diagnostic fingerprint reset if needed)
- [x] 8.5 Simplify `LspRuntimeState` interface: remove all reactive tracking fields, keep only manager, inlineSeverity, inspector, diagnostic fingerprint

## 9. Clean up and verify

- [x] 9.1 Remove unused imports across all modified files
- [x] 9.2 Run `pnpm biome:fix` on all changed files
- [x] 9.3 Run `pnpm typecheck` — fix any type errors from removed modules
- [x] 9.4 Run `pnpm test` — fix any broken tests
- [x] 9.5 Run `pnpm verify` — full verification suite passes
- [x] 9.6 Manual smoke test: start pi in a TypeScript project, verify system prompt contains server info, verify `/lsp-status` shows scan data, verify diagnostics appear as `<extension-context>`, verify no "LSP guidance:" user messages
