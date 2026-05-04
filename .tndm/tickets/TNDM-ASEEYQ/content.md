## Context

`packages/supi-ask-user/src/normalize.ts` line 234 defines:

```ts
function normalizeIdentifier(value: string): string {
  return value.trim();
}
```

This is called 9 times across the file but does nothing beyond `String.prototype.trim()`. The function name is misleading — "normalize identifier" suggests slugification or character filtering, not whitespace trimming.

## What to do

Replace all 9 call sites from `normalizeIdentifier(x)` to `x.trim()` and delete the function.

The call sites are:
- Line 48: `const questionId = normalizeIdentifier(q.id);`
- Line 96: `const id = normalizeIdentifier(q.id);`
- Line 112: `const id = normalizeIdentifier(q.id);`
- Line 129: `id: normalizeIdentifier(q.id),`
- Line 148: `id: normalizeIdentifier(q.id),`
- Line 172: `const value = normalizeIdentifier(opt.value);`
- Line 199: `const value = normalizeIdentifier(recommendation);`
- Line 217: `const value = normalizeIdentifier(recommendationValue);`

## Pre-validation

Read `packages/supi-ask-user/src/normalize.ts` fully. Verify:
- `normalizeIdentifier` is only used within this file (not exported)
- All call sites pass a `string` argument
- No test files import or mock `normalizeIdentifier` directly
- After inlining, `pnpm vitest run packages/supi-ask-user/` passes

## Files affected
- `packages/supi-ask-user/src/normalize.ts`
