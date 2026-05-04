## Context

`filterOutDeclaration` — which filters LSP `textDocument/references` results to exclude the declaration site — appears in two places with slightly different implementations:

1. `packages/supi-code-intelligence/src/actions/callers-action.ts` (~lines 159–170):
```ts
function filterOutDeclaration(refs: LspRef[], targetFile: string, targetPos: LspPos): LspRef[] {
  return refs.filter((ref) => {
    const uri = ref.uri;
    const filePath = uri.startsWith("file://") ? decodeURIComponent(uri.slice(7)) : uri;
    if (filePath !== targetFile) return true;
    const start = ref.range.start;
    return start.line !== targetPos.line || start.character !== targetPos.character;
  });
}
```

2. `packages/supi-code-intelligence/src/actions/affected-action.ts` (~lines 270–283):
```ts
function filterOutDeclaration(
  refs: LspRef[],
  targetFile: string,
  targetPos: { line: number; character: number },
): LspRef[] {
  return refs.filter((ref) => {
    const filePath = uriToFile(ref.uri);
    if (filePath !== targetFile) return true;
    const start = ref.range.start;
    return start.line !== targetPos.line || start.character !== targetPos.character;
  });
}
```

The affected-action version correctly uses the shared `uriToFile` helper. The callers-action version manually decodes URIs, which is less robust and duplicates logic already available in `uriToFile`.

## What to do

1. Move `filterOutDeclaration` into `packages/supi-code-intelligence/src/search-helpers.ts`
2. Standardize on the `uriToFile`-based implementation from affected-action
3. Import from `search-helpers.ts` in both callers-action.ts and affected-action.ts
4. The function should accept generic types or a narrow interface to avoid coupling to `LspRef`

## Pre-validation

Read both implementations:
- `packages/supi-code-intelligence/src/actions/callers-action.ts` (lines 159-170)
- `packages/supi-code-intelligence/src/actions/affected-action.ts` (lines 270-283)

Verify:
- The logic is semantically identical (exclude refs that match file+position of the declaration)
- The `affected-action` version is strictly better (uses `uriToFile`)
- No other action files duplicate this logic
- After unification, `pnpm vitest run packages/supi-code-intelligence/` passes

## Files affected
- `packages/supi-code-intelligence/src/search-helpers.ts` — add `filterOutDeclaration`
- `packages/supi-code-intelligence/src/actions/callers-action.ts` — replace local with import
- `packages/supi-code-intelligence/src/actions/affected-action.ts` — replace local with import
