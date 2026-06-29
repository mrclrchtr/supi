# Task 3: Update source-level code_pattern references to code_find

Update all source code references to `code_pattern` in suggestion/error messages to point to `code_find` instead.

**Files:**
- `packages/supi-code-intelligence/src/brief-focused.ts` L316 — `code_pattern` → `code_find`
- `packages/supi-code-intelligence/src/presentation/markdown/relations.ts` L86 — `code_pattern` → `code_find`
- `packages/supi-code-intelligence/src/presentation/markdown/implementations.ts` L40 — `code_pattern` → `code_find`
- `packages/supi-code-intelligence/src/targeting/resolve-file.ts` L79 — `code_pattern` → `code_find`
- `packages/supi-code-intelligence/src/targeting/resolve-anchored.ts` L64 — `code_pattern` → `code_find`
- `packages/supi-code-intelligence/src/workflow/surface.ts` L78 — update stale non-goal note (now that code_pattern *is* removed)

**Verification:** `grep -rn 'code_pattern' packages/supi-code-intelligence/src/` returns only references in `workflow/surface.ts` (planned absorption metadata — acceptable) and no active tool references
