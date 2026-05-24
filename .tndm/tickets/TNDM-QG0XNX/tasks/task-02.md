# Task 2: [TDD GREEN] Implement 6 focused tree_sitter tools + refactor tree-sitter.ts

Implement focused tool registration in `tree-sitter.ts` + new `tool/register-tools.ts`.

**`tool/register-tools.ts`** (new file):
- Define 6 `SuiPiToolSpec` entries with per-tool metadata, TypeBox schemas, and guidance
- Each spec gets its own description, promptSnippet, and promptGuidelines
- Schemas are minimal: `outline` only needs `file`, `node_at` needs `file`+`line`+`character`, etc.
- Export a `registerFocusedTreeSitterTools(pi, runtime)` function that calls `pi.registerTool()` for each tool
- Each tool's `execute` calls the corresponding existing handler function (`handleOutline`, `handleNodeAt`, etc.)

**`tree-sitter.ts`** (modify):
- Remove the single `pi.registerTool({ name: "tree_sitter", ... })` call
- Remove the `ACTION_HANDLERS` map, `executeToolAction`, `validateToolParams`, `validatePositiveInteger`
- Remove the `TreeSitterActionEnum`, `ToolParams`, `ValidatedToolParams` types
- Remove the multi-action ToolParams type
- Call `registerFocusedTreeSitterTools(pi, runtime)` instead
- Keep `treeSitterExtension` as the default export; keep session lifecycle unchanged

**`tool/guidance.ts`** (modify):
- Replace `toolDescription`, `promptGuidelines`, `promptSnippet` exports (all 3 are compatibility exports for the old single-tool pattern) with per-tool guidance exports or inline the guidance in register-tools.ts

**`tool/action-specs.ts`** — no changes needed (still used internally by handlers)

**Tests to update:**
- `__tests__/guidance.test.ts` — update to check new per-tool guidance structure
- `__tests__/smoke.test.ts` — update to expect 6 tools instead of 1
- `__tests__/tool.test.ts` — update to find tools by new names
