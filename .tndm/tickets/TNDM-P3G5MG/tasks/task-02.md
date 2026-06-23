# Task 2: Implement execute-find.ts executor with mode dispatch

**Goal:** Create the `code_find` tool executor that routes to the right substrate based on `mode`.

**New file:** `packages/supi-code-intelligence/src/tool/execute-find.ts`

**Parameters** (from `CodeFindParameters` in `../workflow/schemas.ts`):
- `query: string` (required)
- `scope?: string`
- `mode?: "text" | "regex" | "ast" | "semantic"` (default `"text"`)
- `kind?: "definition" | "import" | "export" | "call" | "type" | "test"`
- `contextLines?: number` (default 1)
- `maxResults?: number` (default 8)

**Mode dispatch:**

1. **`text` (default):** Call `executePattern` from `../use-case/generate-pattern.ts` with `pattern: query`, `regex: false`, forwarding `scope`, `contextLines`, `maxResults`. Pass `kind` through — if `kind` is set, append a note to the result content indicating kind-filtering is best-effort for text mode.

2. **`regex`:** Same as text but with `regex: true`.

3. **`ast`:** Call `executePattern` with `kind` mapped to the structured kind. Supported `kind` values: `definition`, `export`, `import`. Unsupported `kind` values (`call`, `type`, `test`): return explicit "unavailable" error message.

4. **`semantic`:** Call `getSessionLspService(cwd)` and `service.getWorkspaceSymbols(query)`. Fall back to text search with a note if LSP is unavailable. If symbols are found, render them as ranked results with file/location.

**Result format:**
- Return `CodeIntelResult` with `content` (markdown) and `details: { type: "search", data: SearchDetails }`
- Reuse existing `renderPatternResults` / `renderPatternSummary` / `renderStructuredMatches` from `../presentation/markdown/pattern.ts` for text/regex/ast modes
- Add a lightweight render for semantic mode inline or in `../presentation/markdown/find.ts`

**Edge cases:**
- Empty `query`: return error
- `scope` not found: return error
- No results in any mode: return formatted empty result with next-query hints
- `kind: "call" | "type" | "test"`: return "unavailable — kind X is not yet implemented" for `ast` and `semantic` modes; best-effort note for text/regex modes

**Verification:**
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` passes
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts` — all tests pass (test file created in next task)
