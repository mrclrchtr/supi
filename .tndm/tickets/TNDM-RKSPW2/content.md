## Design: code_context improvements

### Issue 1: Honor `include` in orientation mode

**Current behavior:** `code_context` with `include` but without `task` delegates to `executeBrief()` — the `include` array is silently discarded, and the user gets a full module brief.

**Target behavior:** When `include` is set without `task`, enter a section mode that generates only the requested sections. No target = honest "unavailable" for sections that need one.

**Implementation:**

1. **New function `executeSectionMode()` in `generate-context.ts`:**
   - Builds a compact module header (name, path, git context)
   - Iterates `input.include` using existing `buildRequestedSection()`
   - Sections that need a precise target (references, callees, tests, docs) return their existing "unavailable" messages
   - Sections that have scope-level data (definitions shows scope info, diagnostics can pull from LSP) render what they can
   - Returns via `renderContextResult()` (same renderer used by task mode)

2. **Modify `executeContext()` branching:**
   - Current: `if (!task || !target)` → orientation (ignore include) → task mode
   - New: `if (include && !task)` → section mode → else if `(!task || !target)` → orientation → else → task mode

3. **Files changed:** `src/use-case/generate-context.ts` only (~50 lines added)

### Issue 2: Drop Next-steps from rendered output

**Files to modify — 10 files total:**

| # | File | Change |
|---|------|--------|
| 1 | `presentation/markdown/context.ts` | Remove `nextQueries` from `RenderContextParams`, remove `## Next` rendering block (L34-39) |
| 2 | `presentation/markdown/brief.ts` | Remove `## Next` from `renderFileBrief()` (L163-166), remove `appendNextQueries()` (L236-245) |
| 3 | `presentation/markdown/inspect.ts` | Remove `## Next` section (L117-122) |
| 4 | `presentation/markdown/impact.ts` | Remove `## Next` section (L69) |
| 5 | `presentation/markdown/affected.ts` | Remove `## Next` sections (L68, L122) |
| 6 | `presentation/markdown/relations.ts` | Remove `---` footer with italic recommendation (L261-265) |
| 7 | `use-case/generate-context.ts` | Stop passing `nextQueries` to `renderContextResult()` |
| 8 | `use-case/generate-inspect.ts` | Stop passing `nextQueries` to `renderInspectResult()` |
| 9 | `use-case/generate-brief.ts` | Stop calling `appendNextQueries()` (brief.ts function being removed) |
| 10 | `use-case/generate-impact.ts` | Stop passing `nextQueries` to impact/affected renderers |

**What stays:** `details.nextQueries` is still populated in all use-case generators. Structured data remains intact — only the markdown rendering is dropped.

**Estimated token savings:** ~150-200 tokens per `code_context` call, ~80-150 per `code_inspect`/`code_graph`/`code_impact` call. Across a 10-call chain: ~1,500 tokens saved.

### Verification plan

1. **`code_context` with `include` and no `task`:**
   - `code_context { scope: "...", include: ["defs","diagnostics"] }` → module header + `## Definitions` + `## Diagnostics`
   - `code_context { scope: "...", include: ["references"] }` → "References unavailable without a precise target"

2. **`code_context` with `task` (existing behavior unchanged):**
   - Sections render correctly with headers
   - No `## Next` section in output

3. **All other tools:** Verify no `## Next` or `---` footer remains in rendered output

4. **Existing tests:** Run `pnpm vitest run packages/supi-code-intelligence/`

### Constraints
- No changes to `details` structured data — only rendered markdown
- No new dependencies
- Keep `basePromptGuidelines` in tool-specs.ts (they remain in system prompt)