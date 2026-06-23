# Task 3: Forward hover in CodeProvider composite (supi-code-intelligence)

## Goal

Forward `hover` from the semantic provider in the `CodeProvider` composite in `packages/supi-code-intelligence/src/analysis/context/request-context.ts`.

## Change

In `createCompositeProvider`, add a `hover` method that delegates to `semantic?.hover(filePath, position)`. Returns `null` when semantic is not available.

```ts
async hover(filePath: string, position: { line: number; character: number }) {
  return semantic?.hover?.(filePath, position) ?? null;
},
```

## Verification
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` passes
