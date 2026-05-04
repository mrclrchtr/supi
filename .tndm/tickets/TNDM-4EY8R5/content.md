## Context

`packages/supi-lsp/src/tool-actions.ts` has 10 action handlers. Six of them (`handleHover`, `handleDefinition`, `handleReferences`, `handleRename`, `handleCodeActions`, plus `handleSymbols`/`handleDiagnostics` variants) repeat the same mechanical 6-line preamble:

```ts
const validation = validateFilePosition(params, "hover");
if (typeof validation === "string") return validation;
const { file, line, character } = validation;
const resolvedPath = resolveFilePath(file, cwd);
const client = await manager.ensureFileOpen(resolvedPath);
if (!client) return noServerMessage(resolvedPath);
```

This appears at lines ~142–148, ~160–166, ~182–188, ~253–260, ~275–282.

## What to do

Extract a higher-order helper that encapsulates validation, path resolution, and client acquisition:

```ts
async function withFileClient(
  manager: LspManager,
  params: LspToolParams,
  cwd: string,
  action: string,
  fn: (client: LspClient, file: string, line: number, character: number) => Promise<string>,
): Promise<string>
```

Each handler then becomes:
```ts
async function handleHover(manager, params, cwd) {
  return withFileClient(manager, params, cwd, "hover", async (client, file, line, character) => {
    const hover = await client.hover(file, toZeroBased(line, character));
    if (!hover) return "No hover information available at this position.";
    return formatHover(hover);
  });
}
```

## Pre-validation

Read `packages/supi-lsp/src/tool-actions.ts` fully. Verify that:
- At least 6 handlers repeat the `validateFilePosition → resolveFilePath → ensureFileOpen → noServerMessage` pattern
- The extracted wrapper can cleanly replace all 6 without behavior changes
- Handlers with non-standard preambles (diagnostics file-branch, symbols, workspace_symbol, search, symbol_hover) are left alone

Run the existing tests to ensure no regressions:
```bash
pnpm vitest run packages/supi-lsp/
```

## Files affected
- `packages/supi-lsp/src/tool-actions.ts` — extraction + hook replacement
- `packages/supi-lsp/__tests__/tool-actions.validation.test.ts` — verify existing tests still pass
