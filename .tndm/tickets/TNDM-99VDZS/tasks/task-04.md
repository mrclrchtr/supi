# Task 4: Gather hover data in anchored brief use-case (supi-code-intelligence)

## Goal

Call `provider.hover()` in the anchored brief code path and pass the result to the renderer.

## Change

1. **`src/use-case/generate-brief.ts`**:
   - Extend `TreeSitterContext` with optional `hover: { contents: string; range?: SourceRange } | null`
   - In `gatherTreeSitterContext`, add a parallel hover call when provider is available:
     ```ts
     let hover: TreeSitterContext["hover"] = null;
     if (provider?.hover) {
       try {
         const hoverResult = await provider.hover(relPath, {
           line: line - 1,
           character: character - 1,
         });
         if (hoverResult) hover = hoverResult;
       } catch { /* best-effort */ }
     }
     ```
   - Note: `hover` expects 0-based LSP coordinates, but `gatherTreeSitterContext` receives 1-based user coordinates from the tool. Convert `line - 1, character - 1` before passing.
   - Return `hover` in the context object.

2. **`src/use-case/types.ts`** (if needed):
   - May need to import `SourceRange` from supi-code-runtime, or define a local type.

## Verification
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` passes
- Existing tests still pass: `pnpm vitest run packages/supi-code-intelligence/`

