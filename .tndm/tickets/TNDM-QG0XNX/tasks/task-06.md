# Task 6: [TDD GREEN] Update LSP service actions, registration, state, and extension wiring

**`tool/service-actions.ts`:**
- Add 6 new exported functions that wrap the existing logic without code duplication:
  - `executeHover(service, cwd, params)` → validates position + file, calls `service.hover()`
  - `executeDefinition(service, cwd, params)` → validates position + file, calls `service.definition()`
  - `executeReferences(service, cwd, params)` → validates position + file, calls `service.references()`
  - `executeImplementation(service, cwd, params)` → validates position + file, calls `service.implementation()`
  - `executeRename(service, cwd, params)` → validates position + file, `newName` required by schema (no runtime validation needed), calls `service.rename()`
  - `executeCodeActions(service, cwd, params)` → validates position + file, calls `service.codeActions()`
- Share validation helpers (`validatePositivePosition`, `validateFile`, `formatUnexpectedFailure`) — already exist, no changes needed
- Keep the old `executeLookup` and `executeRefactor` functions temporarily for backward compat, or remove if no other callers exist (check first)
- Remove `LspLookupKind`, `LspRefactorKind`, `LspLookupToolParams`, `LspRefactorToolParams` types

**`tool/register-tools.ts`:**
- Already uses `LSP_TOOL_DEFINITION_SPECS` — automatically picks up the 10 specs from updated `tool-specs.ts`

**`session/lsp-state.ts`:**
- `LSP_TOOL_NAMES` already imported from `tool/names.ts` — automatically reflects the 10 names
- No code changes needed (the activation system handles any tool name count)

**`lsp.ts`:**
- Register tools with `defaultLspToolPromptSurfaces` at extension load (line ~54): now covers 10 surfaces instead of 6
- Re-register with dynamic surfaces on `session_start` (line ~118): now covers 10 surfaces
- Remove any references to the old tool name constants if present (check `isLspAwareTool`, `removeLspTools`, `ensureLspToolsActive`)

**Tests to update:**
- `__tests__/unit/guidance.test.ts` — update tool name references from `lsp_lookup`/`lsp_refactor` to new names
- `__tests__/unit/workspace-sentinel-recovery.test.ts` — update tool name map entries
- `__tests__/unit/renderer.test.ts` — update tool name map entries
