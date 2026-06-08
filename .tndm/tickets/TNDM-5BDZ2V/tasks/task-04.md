# Task 4: Gate git context in orientation briefs behind once-per-session flag

## Goal
Show git context (branch, dirty files, last commit) only on the first `code_context` orientation call per session. Saves ~30 tokens per subsequent call.

## Files
- `packages/supi-code-intelligence/src/tool/execute-context.ts`
- `packages/supi-code-intelligence/src/use-case/generate-context.ts`
- `packages/supi-code-intelligence/src/use-case/types.ts`
- `packages/supi-code-intelligence/src/brief-focused.ts`

## Design decision
The tool executors don't have direct access to `WorkspaceManager`. They get `ctx: { cwd: string }` from the spec runner. Use a module-level `Set<string>` in `execute-context.ts` to track which cwds have already shown git context — this matches the existing per-cwd state pattern used by `getCodeProvider()` in `request-context.ts`.

No changes to `workspace-session.ts` needed — the tracking lives at the tool executor level since that's where the decision is made.

## Changes

### `execute-context.ts`
1. Add module-level `const shownGitContextCwds = new Set<string>()`.
2. In `executeContextTool()`, before calling `executeContext()`:
   - Compute `showGitContext = !shownGitContextCwds.has(ctx.cwd)`
   - Pass `showGitContext` through the context input
3. After a successful orientation render (when `!params.task` or `!params.target`), add `ctx.cwd` to `shownGitContextCwds`.

### `types.ts` (use-case)
Add `showGitContext?: boolean` to `ContextInput` interface.

### `generate-context.ts`
In `executeOrientationContext()`: pass `showGitContext: input.showGitContext ?? true` to the brief renderer call. Default `true` maintains backward compatibility for callers that don't set it (e.g., the first-turn overview in `build-overview.ts`).

### `brief-focused.ts`
Find the ~3 call sites that call `gatherGitContext()` / `formatGitContext()`:
- File brief
- Module brief
- Non-module directory brief

Gate each: if `showGitContext` is false (or not provided as true), skip the `gatherGitContext()` call. Thread `showGitContext` as a parameter through the focused brief options or as a direct argument to the internal functions.

## Verification
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/brief.test.ts` — the "includes git context when in a git repo" test calls `generateOverview()` which uses `build-overview.ts` (separate path, not `brief-focused.ts`). This test should pass unchanged.
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts`
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`
