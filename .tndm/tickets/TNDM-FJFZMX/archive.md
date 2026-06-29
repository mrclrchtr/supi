# Archive

## Fresh verification (2026-05-28)

### TypeScript
```
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
→ TypeScript: No errors found (exit 0)
```

### Biome
```
pnpm exec biome check packages/supi-code-intelligence/
→ Checked 141 files in 518ms. No fixes applied. (exit 0)
```

### Tests
```
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/
→ Test Files  38 passed | 2 skipped (40)
→ Tests       342 passed | 4 skipped (346)
→ exit 0
```

### Dead-code audit
```
grep -rn "executeLspTool\|executeTsTool\|registerLspTools\|registerTsTools" packages/supi-code-intelligence/src/
→ exit 1 (no matches)
```

### Deleted files confirmed absent (11 total)
- packages/supi-code-intelligence/src/lsp/register-tools.ts
- packages/supi-code-intelligence/src/lsp/tool-specs.ts
- packages/supi-code-intelligence/src/lsp/guidance.ts
- packages/supi-code-intelligence/src/lsp/tool-actions.ts
- packages/supi-code-intelligence/src/lsp/format-utils.ts
- packages/supi-code-intelligence/src/tree-sitter/register-tools.ts
- packages/supi-code-intelligence/src/tree-sitter/tool-specs.ts
- packages/supi-code-intelligence/src/tree-sitter/guidance.ts
- packages/supi-code-intelligence/src/tree-sitter/tool-actions.ts
- packages/supi-code-intelligence/src/tree-sitter/execute.ts
- packages/supi-code-intelligence/src/tree-sitter/format.ts

### Code review fixes applied
- Deleted 3 additional orphaned files (format-utils.ts, execute.ts, format.ts)
- Fixed surface.ts code_health.nonGoals edit that silently failed in Task 2

### Modified files (6)
- packages/supi-code-intelligence/CLAUDE.md — architecture diagram + absorption gaps
- packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts — absent-tool assertion
- packages/supi-code-intelligence/src/lsp/diagnostic-injection.ts — LSP_TOOL_NAMES fixup
- packages/supi-code-intelligence/src/workflow/names.ts — Phase 1.5 comment
- packages/supi-code-intelligence/src/workflow/surface.ts — code_health nonGoal fix
