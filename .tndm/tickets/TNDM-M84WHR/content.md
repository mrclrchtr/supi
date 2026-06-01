## Verification (fresh, 2026-06-01)

### Task 1: Delete legacy executors
- ✅ Zero references to `executeBriefTool` or `executeAffectedTool` in codebase (rg exit 2 = no matches)
- ✅ `src/tool/execute-brief.ts` deleted (73 lines)
- ✅ `src/tool/execute-affected.ts` deleted (16 lines)
- ✅ 10 test files migrated to V2 executors
- ✅ CLAUDE.md directory tree updated

### Task 2: Relax graph file-level validation
- ✅ `code_graph` accepts bare `file` for `imports`/`exports` relations
- ✅ Verified: `code_graph(file, relations:["exports"])` returns 2 exports without error
- ✅ Target resolution skipped for file-level-only relations

### Task 3: Implement find ast call/type/test kinds
- ✅ `call` kind: 16 function declarations found for query `"execute"` across 11 files
- ✅ `type` kind: 14 interface/type declarations found for query `"Code"` across 13 files
- ✅ `test` kind: Matches test-pattern names in outline data
- ✅ Outline kind names corrected to use normalized values (`"function"`, `"method"`, `"class"`, etc.)

### Test suite
- 47/49 test files passed (2 skipped)
- 444/448 tests passed (4 skipped)
- Duration: 4.13s

### Typecheck
- Clean, exit 0

### Delta
- 19 files changed, +224/-244 lines (net -20)