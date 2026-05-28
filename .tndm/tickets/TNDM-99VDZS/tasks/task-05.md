# Task 5: Render hover in anchored brief markdown (supi-code-intelligence)

## Goal

Render hover info in the anchored brief markdown output.

## Change

In `packages/supi-code-intelligence/src/presentation/markdown/brief.ts`:

1. Update `TreeSitterContext` to include `hover`:
   ```ts
   interface TreeSitterContext {
     nodeInfo: ...;
     outline: ...;
     imports: ...;
     exports: ...;
     hover?: { contents: string; range?: SourceRange } | null;
   }
   ```

2. In `renderAnchoredBrief`, add a hover section after the node info and before the outline:
   ```ts
   if (params.context.hover?.contents) {
     lines.push("## Hover");
     lines.push("```");
     lines.push(params.context.hover.contents);
     lines.push("```");
     lines.push("");
   }
   ```

This surfaces type signatures, documentation, and other hover info in the brief output.

## Verification
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` passes
- Existing tests pass: `pnpm vitest run packages/supi-code-intelligence/`

