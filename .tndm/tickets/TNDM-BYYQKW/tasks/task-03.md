# Task 3: Remove direction/depth/maxNodes from code_graph schema (silent contract violation)

## Goal
Remove `direction`, `depth`, and `maxNodes` from the `code_graph` parameter schema and executor. These params were accepted but silently ignored — removing them makes the API contract honest. `maxResults` already serves the same purpose.

## Files
- `packages/supi-code-intelligence/src/workflow/schemas.ts` — remove direction/depth/maxNodes from `CodeGraphParameters`
- `packages/supi-code-intelligence/src/tool/execute-graph.ts` — remove from `CodeGraphToolParams` interface
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — update description and prompt guidelines
- `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts` — update any test that passes these params

## Changes

### 1. `workflow/schemas.ts`

Remove these three fields from `CodeGraphParameters`:
```ts
direction: Type.Optional(StringEnum(["in", "out", "both"], { ... })),
depth: Type.Optional(Type.Number({ ... })),
maxNodes: Type.Optional(Type.Number({ ... })),
```
Keep `maxResults` (it already serves as the per-relation result cap).

### 2. `tool/execute-graph.ts`

Remove from `CodeGraphToolParams` interface:
```ts
direction?: "in" | "out" | "both";
depth?: number;
maxNodes?: number;
```
No other code changes needed — the executor never consumed these fields.

### 3. `tool/tool-specs.ts`

Remove the prompt guideline line:
```
"In code_graph, `direction`, `depth`, `maxNodes` are accepted but reserved for future use."
```
The description already accurately describes the tool. No description change needed unless it mentions these params.

### 4. Test updates

Search for `direction`, `depth`, or `maxNodes` in test files under `__tests__/unit/tool/` and `__tests__/unit/code-graph*`. If any test passes these params, remove the params from the test call. If no tests pass them, no test changes needed.

## Verification

1. Run: `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json` — must typecheck clean
2. Run: `pnpm vitest run packages/supi-code-intelligence/` — all tests must pass
3. grep for `direction`, `depth`, `maxNodes` in the source tree to confirm no orphan references remain:
   ```
   rg "direction.*in.*out.*both|depth.*Number|maxNodes.*Number" packages/supi-code-intelligence/src/
   ```
