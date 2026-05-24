# Task 1: [TDD RED] Write failing tests for 6 focused tree_sitter tools

New test file `tool-focus.test.ts` that:

1. **Six tools are registered with correct metadata:** Create a pi mock via `createPiMock()`, call the extension, assert:
   - `pi.registerTool` called 6 times (not 1)
   - Tool names: `tree_sitter_outline`, `tree_sitter_imports`, `tree_sitter_exports`, `tree_sitter_node_at`, `tree_sitter_query`, `tree_sitter_callees`
   - Each tool has `label`, `description`, `promptSnippet`, `promptGuidelines`, `parameters`
   - No tool named `tree_sitter` registered

2. **Per-tool schemas are correct:**
   - `tree_sitter_outline` parameters: only `file` (no `action`, `line`, `character`, `query`)
   - `tree_sitter_node_at` parameters: `file`, `line`, `character` (no `action`, `query`)
   - `tree_sitter_query` parameters: `file`, `query` (no `action`, `line`, `character`)
   - `tree_sitter_callees` parameters: `file`, `line`, `character` (no `action`, `query`)

3. **Per-tool guidance is specific:**
   - `tree_sitter_outline.description` mentions "shallow structure" and "JavaScript/TypeScript-only"
   - `tree_sitter_callees.description` mentions "outgoing calls" and "enclosing function"
   - `tree_sitter_query.description` mentions "custom patterns" and "all supported grammars"

4. **Existing smoke test still passes** — the extension registers tools, just 6 instead of 1

Do NOT update existing tests yet — only add the new test file.
