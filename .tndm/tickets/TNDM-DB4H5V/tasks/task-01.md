# Task 1: Extract overview and brief into typed use-case and markdown presentation layers

## Goal
Move the hidden overview path and the brief/public overview helpers onto the new internal layering first so the package has one clear pattern for both extension wiring and public helper exports.

## Files
Create:
- `packages/supi-code-intelligence/src/use-case/types.ts`
- `packages/supi-code-intelligence/src/use-case/build-overview.ts`
- `packages/supi-code-intelligence/src/use-case/generate-brief.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/overview.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/brief.ts`

Modify:
- `packages/supi-code-intelligence/src/code-intelligence.ts`
- `packages/supi-code-intelligence/src/brief.ts`
- `packages/supi-code-intelligence/src/api.ts`
- `packages/supi-code-intelligence/src/index.ts`
- `packages/supi-code-intelligence/src/tool/execute-brief.ts`
- `packages/supi-code-intelligence/src/brief-focused.ts` only if imports/types must be adapted cleanly
- `packages/supi-code-intelligence/__tests__/unit/brief.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`

Retire or convert:
- `packages/supi-code-intelligence/src/actions/brief-action.ts`

## Change
1. Write/update failing tests first for:
   - hidden overview injection still dedupes and renders the same observable text shape
   - `generateOverview()` / `generateProjectBrief()` / symbol or anchored brief flows still return the same public data contract
   - `executeBriefTool()` remains a thin adapter returning `CodeIntelResult`
2. Add typed overview and brief use-cases that return structured data instead of markdown strings.
3. Add markdown renderers for overview and brief outputs.
4. Update `src/code-intelligence.ts` to call the overview use-case + renderer instead of assembling the hidden message through `brief.ts` directly.
5. Update `src/brief.ts` so it becomes a public facade over the new use-case/presentation modules, preserving the existing exported helper names.
6. Remove markdown-building responsibility from `src/actions/brief-action.ts`; delete it if all imports are migrated, otherwise reduce it to a temporary delegate and remove it before this task finishes.

## Verification
RED/GREEN focused checks during the task:
- `RTK_DISABLED=1 pnpm -v exec vitest run packages/supi-code-intelligence/__tests__/unit/brief.test.ts packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`

Type/style checks for touched files:
- `RTK_DISABLED=1 pnpm -v exec biome check packages/supi-code-intelligence/src/code-intelligence.ts packages/supi-code-intelligence/src/brief.ts packages/supi-code-intelligence/src/use-case packages/supi-code-intelligence/src/presentation/markdown packages/supi-code-intelligence/__tests__/unit/brief.test.ts packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
- `RTK_DISABLED=1 pnpm -v exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json`

