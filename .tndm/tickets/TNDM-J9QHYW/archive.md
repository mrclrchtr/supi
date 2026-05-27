# Archive

## Final Verification — TNDM-J9QHYW

### Test suite
- **292 tests pass, 4 skipped**, 36 test files (full package run)
- Tasks 1, 3, 5 RED tests: confirmed failures on old surface → passed on new surface

### Typecheck
- `tsc -b tsconfig.json __tests__/tsconfig.json` — zero errors

### Stale reference scan
- `rg "code_relations|kind: \"callers\"|Callers of" README.md CLAUDE.md src/tool/guidance.ts` — only allowed internal reference (architecture diagram noting transitional module)

### Code review findings (all fixed)
| # | Finding | Fix |
|---|---------|-----|
| 1 | Planner blocked valid plans on missing provider | Route now returns `preferred: "semantic"` unconditionally |
| 2 | Misleading `exportedOnly` param in references schema | Removed from both schema and interface |
| 3 | Stale `code_refactor` docs in CLAUDE.md | Rewritten to two-step plan/apply |
| 4 | Dead variable `_symbolName` | Wired through to renderer with target name |
| 5 | Duplicate assertion block in test | Removed |
| 6 | Stale tool names in lsp tool-actions.ts and supi-debug | Updated both |

### Key results
- New public tools: `code_references`, `code_calls`, `code_implementations`, `code_refactor_plan`, `code_refactor_apply`
- Removed: `code_relations`, `code_refactor`
- Two-step refactor with SHA-256 fingerprint staleness detection
- No heuristic fallback for semantic tools
- 15 new implementation files across services, executors, renderers, and plan-store
- 12 modified source files (types, specs, guidance, routing, test helpers)
