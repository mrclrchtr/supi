# Task 5: Update CLAUDE.md package docs for code_find

**Goal:** Document `code_find` in the package CLAUDE.md alongside existing tool contracts.

**File:** `packages/supi-code-intelligence/CLAUDE.md`

**Changes:**

1. Update the surface description at the top to include `code_find` in the tool list.

2. Add a `### code_find` subsection under `## Public tool contracts`:
   - Schema summary (required `query`, optional `mode`/`kind`/`scope`/`contextLines`/`maxResults`)
   - Mode descriptions: text (ripgrep literal, default), regex (ripgrep regex), ast (tree-sitter structured), semantic (LSP workspace symbols with text fallback)
   - `kind` filtering note: best-effort in text/regex modes, 1:1 mapping in ast mode, deferred for `call`/`type`/`test`
   - Note that `code_pattern` remains available during transition

3. Update the architecture diagram in the comment block to add `tool/execute-find.ts`.

**Non-goals:** Does not remove `code_pattern` docs — those stay until the follow-up cleanup.

**Verification:**
- Read the rendered CLAUDE.md — `code_find` section is present and accurate
- `pnpm exec biome check packages/supi-code-intelligence/CLAUDE.md` passes (markdown lint)

