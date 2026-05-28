# Task 3: Add unit tests for code_find

**Goal:** TDD-style tests for the `code_find` executor covering all modes, kind filtering, and edge cases.

**New file:** `packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts`

**Test cases** (use `vi.mock` for LSP and tree-sitter substrates, `createPiMock` for extension wiring, temp dirs for real ripgrep tests):

1. **`mode: "text"` (default)** — matches existing `code_pattern` literal behavior; verify results with temp files
2. **`mode: "regex"`** — matches existing `code_pattern` regex behavior
3. **`mode: "ast"` with `kind: "definition"`** — delegates to structured search; verify unavailable when no structural provider
4. **`mode: "ast"` with unsupported `kind`** (`call`, `type`, `test`) — returns "unavailable" message
5. **`mode: "semantic"`** — delegates to LSP workspace symbols; verify fallback to text search when LSP unavailable
6. **Empty `query`** — returns error message
7. **Scope not found** — returns error message
8. **No results (any mode)** — formatted empty result with next-query hints
9. **`kind` filtering in text mode** — verify best-effort note appended to results
10. **Parameter shape** — verify `query` is required and others are optional via schema inspection

**Mock strategy:**
- For text/regex/ast modes: reuse the existing `executePatternAction` / `executePattern` test patterns — create temp files and call the executor directly
- For semantic mode: mock `getSessionLspService` from `@mrclrchtr/supi-lsp/api` using `vi.mock` + `vi.hoisted`
- For structural (ast) mode: mock `getCodeProvider` from `../analysis/context/request-context.ts`

**Verification:**
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts` — all tests pass
- Red-green-refactor: write failing tests first, then implement in task 2

