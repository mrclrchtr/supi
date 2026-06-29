# Task 1: Fix code_impact findLikelyTests with boundary-aware regex + companions fallback

## Goal
Replace the naive substring matching in `findLikelyTests` with boundary-aware regex and add companions fallback.

## Files
- `packages/supi-code-intelligence/src/use-case/generate-impact.ts` — rewrite `findLikelyTests`
- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts` — add test cases

## Change

### Source change (`generate-impact.ts`)

Replace the current `findLikelyTests`:

```ts
function findLikelyTests(affectedFiles: Set<string>): string[] {
  const tests: string[] = [];
  for (const file of affectedFiles) {
    if (file.includes("test") || file.includes("spec") || file.includes("__tests__")) {
      tests.push(file);
    }
  }
  return tests.slice(0, 3);
}
```

With a boundary-aware version that:

1. Defines a regex `TEST_FILE_RE = /(?:^|[\/\\])(?:[^\/\\]*\.(?:test|spec)\.[^.]+$|__tests__[\/\\])/` that requires path separator or start-of-string before "test"/"spec" and path separator around "__tests__"
2. Filters affected files through the regex
3. Declares `provenance: "name heuristic"` for regex matches
4. Falls back to `findTestCompanions` for files that don't match the regex but are in affectedFiles — converts affected files to `ChangedFileEntry[]` and uses the existing `findTestCompanions` function. Declares `provenance: "companion file"` for these.
5. Deduplicates results (a file found by both regex and companions should appear once)
6. Returns up to 3 test files sorted by path

### Test changes (`code-impact-tool.test.ts`)

Add a new `describe("findLikelyTests boundary awareness")` block:

1. "does not match tool-specs.ts as a test file" — the key regression test
2. "does not match contest.ts" — "test" substring in middle of regular word
3. "matches myModule.test.ts" — `.test.` boundary
4. "matches myModule.spec.ts" — `.spec.` boundary
5. "matches __tests__/myModule.ts" — `/__tests__/` directory
6. "includes companion test files as fallback" — affected files without test-like names still discover companion files
7. "deduplicates when regex and companions find the same file"

Extract `findLikelyTests` to an exported function (or test via the impact pipeline with mock providers).

## Verification
Run: `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts`

All existing tests must pass. New boundary-awareness tests must pass with no false positive on `tool-specs.ts`.
