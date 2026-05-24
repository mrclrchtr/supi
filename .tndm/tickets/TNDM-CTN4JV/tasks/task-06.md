# Task 6: Update action files to accept substrate parameters

Update each action to receive substrates as explicit parameters instead of importing from `providers/`.

**`callers-action.ts`**:
- Add `semantic: SemanticSubstrate` parameter to `executeCallersAction()`
- Replace `import { getSemanticService } from "../providers/semantic-provider.ts"` with `import type { SemanticSubstrate } from "../substrates/types.ts"`
- Replace `const lsp = await getSemanticService(cwd, { waitForReady: true }); if (!lsp) return ...; const refs = await lsp.references(...)` with `const refs = await semantic.references(target.file, target.position); if (!refs) return ...`
- `refs` are now `CodeLocation[]` — update the `uriToFile`/line+1 unpacking to use `CodeLocation.uri` and `CodeLocation.range.start.line + 1` (or add a helper)
- Same for `collectCallerRefs()` helper

**`affected-action.ts`**:
- Add `semantic: SemanticSubstrate` parameter
- Replace provider import with `SemanticSubstrate` type import
- Replace `getSemanticService` call + null check with `semantic.references()`
- Update `gatherReferences()` helper similarly
- Update `CodeLocation` unpacking

**`implementations-action.ts`**:
- Add `semantic: SemanticSubstrate` parameter
- Replace provider import + `getSemanticService` call with `semantic.implementation()`
- Normalize `Array.isArray(impls)` is already done in the adapter — remove

**`callees-action.ts`**:
- Add `structural: StructuralSubstrate` parameter
- Replace `withStructuralSession` import + call with `structural.calleesAt()`
- `result` is already `StructuralResult<CalleesData>` (adapter returns normalized types)

**`brief-action.ts`**:
- Add `structural: StructuralSubstrate` parameter to `executeBriefAction()`
- Replace `withStructuralSession` calls with `structural` methods
- Update `addTreeSitterContext()` and its sub-helpers (`addNodeContext`, `addOutlineContext`, etc.) to receive `StructuralSubstrate` instead of `TreeSitterService`
- Remove `import type { TreeSitterService } from "@mrclrchtr/supi-tree-sitter/api"`
- Update types: `OutlineItem` → `OutlineData`, `ExportRecord` → `ExportData`, `ImportRecord` → `ImportData`, `NodeAtResult` → `NodeAtData`

**`pattern-structured.ts`**:
- Add `structural: StructuralSubstrate` parameter to `getStructuredPatternMatches()`
- Replace `withStructuralSession` with direct `structural` method calls
- `collectMatchesForFile()` receives `StructuralSubstrate` instead of `TreeSitterService`
- Update import from `supi-tree-sitter/api` to `substrates/types.ts`

Update existing unit tests for each action to pass mock substrates instead of mocking providers. Tests should inject `vi.fn()` mocks for `SemanticSubstrate` / `StructuralSubstrate` instead of mocking `getSemanticService` / `withStructuralSession`.

Run `pnpm vitest run packages/supi-code-intelligence/` — all tests should pass.
