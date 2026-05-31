# Task 2: GREEN: implement `code_inspect` and make `code_brief` orientation-only

# Goal
Implement the new point-inspection tool, preserve useful orientation flows, and remove hidden inspect behavior from `code_brief`.

# Files
- `packages/supi-code-intelligence/src/intent/types.ts`
- `packages/supi-code-intelligence/src/workflow/names.ts`
- `packages/supi-code-intelligence/src/workflow/index.ts`
- `packages/supi-code-intelligence/src/workflow/schemas.ts`
- `packages/supi-code-intelligence/src/workflow/surface.ts`
- `packages/supi-code-intelligence/src/tool/tool-specs.ts`
- `packages/supi-code-intelligence/src/tool/execute-inspect.ts` (new)
- `packages/supi-code-intelligence/src/tool/execute-brief.ts`
- `packages/supi-code-intelligence/src/tool/target-id-params.ts`
- `packages/supi-code-intelligence/src/analysis/routing/planner.ts`
- `packages/supi-code-intelligence/src/use-case/types.ts`
- `packages/supi-code-intelligence/src/use-case/generate-brief.ts`
- `packages/supi-code-intelligence/src/use-case/generate-inspect.ts` (new)
- `packages/supi-code-intelligence/src/use-case/gather-context.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/inspect.ts` (new)
- `packages/supi-code-intelligence/src/presentation/markdown/brief.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/resolve.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/relations.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/calls.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/affected.ts`
- `packages/supi-code-intelligence/src/use-case/generate-impact.ts`
- `packages/supi-code-intelligence/src/analysis/targeting/resolve-target.ts`
- `packages/supi-code-intelligence/src/types.ts`
- `packages/supi-code-intelligence/src/index.ts`
- `packages/supi-code-intelligence/src/api.ts`

# Change
1. Add `code_inspect` to the public/workflow name lists and define `CodeInspectParameters` with only `file`, `line`, `character`, and optional `maxResults`.
2. Register `code_inspect` in `tool-specs.ts` with intent-level guidance for factual point inspection.
3. Add `execute-inspect.ts` and `generate-inspect.ts` that gather:
   - syntax node / ancestry
   - enclosing symbol
   - hover/type info
   - definition target(s)
   - nearby diagnostics in the inspected file
   - code action titles
   - next recommended code tools
4. Extend or reuse `gather-context.ts` for point gathering, but do not add heuristic fallbacks. Missing provider data must render as explicit unavailable sections.
5. Add `InspectDetails` in `src/types.ts`, return `{ type: "inspect" }` from the executor, and re-export the new detail type from `src/index.ts` and `src/api.ts`.
6. Remove anchored inspection from `code_brief`:
   - public schema no longer exposes `line` or `character`
   - `BriefInput` no longer includes an anchored mode
   - `executeBriefTool` no longer routes `targetId` into anchored file coordinates
7. Preserve useful orientation flows:
   - `code_brief({ targetId })` should use handle metadata to produce an orientation-only symbol/file brief
   - `code_brief({ symbol })` should remain supported, but its renderer must stop emitting inspect-style node/hover/definition/code-action sections
8. Update user-facing follow-up strings in resolve/relations/calls/affected/impact/targeting code so point-specific advice goes to `code_inspect` and broad orientation advice stays on `code_brief`.
9. Remove `packages/supi-code-intelligence/__tests__/unit/presentation/anchored-brief.test.ts` after its coverage is fully replaced by `inspect.test.ts`.

# Verification
Run the RED test command again and make it pass, then run package typecheck:

```bash
RTK_DISABLED=1 pnpm vitest run -v \
  packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts \
  packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-inspect-tool.test.ts \
  packages/supi-code-intelligence/__tests__/unit/presentation/inspect.test.ts \
  packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts \
  packages/supi-code-intelligence/__tests__/unit/review-fixes.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts \
  packages/supi-code-intelligence/__tests__/unit/presentation/relations-render.test.ts

RTK_DISABLED=1 pnpm exec tsc -b \
  packages/supi-code-intelligence/tsconfig.json \
  packages/supi-code-intelligence/__tests__/tsconfig.json
```

Expected result: both commands succeed.

# Test mode
Test-driven (GREEN after Task 1 RED).
