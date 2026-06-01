# Task 4: Add explicit guidance when code_context task mode has no target

## Goal
When `code_context` is called with a `task` but no `targetId`, `file`, or `symbol`, return explicit guidance instead of building empty sections. Do NOT attempt to infer targets from the task string.

## Files
- `packages/supi-code-intelligence/src/use-case/generate-context.ts` — early return in executeTaskContext
- `packages/supi-code-intelligence/src/tool/execute-context.ts` — no changes needed (just passes through)
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts` — add test

## Changes

### Source change (`generate-context.ts`)

In `executeTaskContext`, before the existing section building loop, add:

```ts
// ── No-target guard ────────────────────────────────────
if (!input.target) {
  const guidanceMessage = [
    "**No target provided for task-focused context.**",
    "",
    `Task: "${input.task ?? "(none)"}"`,
    "",
    "To use task-focused context, first resolve a target:",
    "1. Use `code_resolve` with a `query` that matches your task to find the relevant symbol, file, or function",
    "2. Pass the returned `targetId` to `code_context`",
    "",
    "Example:",
    '  `code_resolve` { query: "function name from your task", kind: "function" }',
    "  `code_context` { targetId: "...", task: "your task here" }",
  ];

  const details: ContextDetails = {
    confidence: "unavailable",
    task: input.task ?? null,
    focusTarget: null,
    requestedSections: requestedSections,
    renderedSections: [],
    omittedCount: 0,
    nextQueries: ["Use `code_resolve` to resolve a target first"],
  };

  return {
    content: guidanceMessage.join("\n"),
    details,
  };
}
```

Place this immediately after the `const sections: RenderedContextSection[] = [];` line and before the `const treeContext = await maybeGatherTreeContext(...)` line.

### Test change (`code-context-tool.test.ts`)

Add test:
- "returns explicit resolve-first guidance when task is provided but no target" — call code_context with `task: "rename something"` and no targetId, verify response contains "No target provided", "code_resolve", and "targetId"

## Verification
Run: `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts`
New test must pass. Existing tests must continue to pass unchanged.
