# Archive

## Verification

### Task 1: Delete legacy executors
- ✅ Deleted `src/tool/execute-brief.ts` and `src/tool/execute-affected.ts`
- ✅ Migrated 7 test files + 1 test helper
- ✅ Updated CLAUDE.md directory tree
- ✅ Zero remaining references to `executeBriefTool` or `executeAffectedTool` in codebase

### Task 2: Relax graph file-level validation
- ✅ Added `FILE_LEVEL_RELATIONS` detection in `execute-graph.ts`
- ✅ When all relations are file-level (`imports`/`exports`), bare `file` is accepted without line/character
- ✅ Target resolution skipped for file-level-only relations
- ✅ Error messages updated with guidance about file-level support

### Task 3: Implement find ast call/type/test kinds
- ✅ Extended `StructuredPatternKind` to include `call`, `type`, `test`
- ✅ Added `isCallLikeKind`/`isTypeLikeKind` helpers with tree-sitter node kind sets
- ✅ Test kind uses name-pattern matching (test/spec/describe/it prefixes)
- ✅ Updated `collectMatchesForFile` with kind-specific outline filtering
- ✅ Updated `STRUCTURED_KINDS` in `execute-find.ts`
- ✅ Updated `generate-pattern.ts` and `pattern.ts` type signatures and labels
- ✅ Updated 4 test expectations in `code-find-tool.test.ts`

### Test results
- 47/49 test files passed (2 skipped)
- 444/448 tests passed (4 skipped)
- Typecheck: clean
