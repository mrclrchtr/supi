# Task 3: Remove lsp_* and tree_sitter_* tool registration from extension wiring

## Goal

Remove `registerLspTools()` and `registerTsTools()` calls from the extension wiring. LSP and tree-sitter continue to work as substrates for the code_* tools — only their direct public tool registration is removed.

## Files

### `packages/supi-code-intelligence/src/code-intelligence.ts`

- Remove: `import { defaultLspToolPromptSurfaces } from "./lsp/guidance.ts";`
- Remove: `import { registerLspTools } from "./lsp/register-tools.ts";`
- Remove: `registerLspTools(pi, defaultLspToolPromptSurfaces);` call
- Keep all other imports and calls intact (LSP lifecycle, settings, diagnostic injection, workspace recovery, tool overrides)

### `packages/supi-code-intelligence/src/tree-sitter/session-lifecycle.ts`

- Remove: `import { defaultTsToolPromptSurfaces } from "./guidance.ts";`
- Remove: `import { registerTsTools } from "./register-tools.ts";`
- Remove: `registerTsTools(pi, getRuntime, defaultTsToolPromptSurfaces);` call from `registerTsSessionLifecycle()`
- Keep the `getRuntime` thunk and lifecycle controller logic intact
- Note: the `getRuntime` function is still used by the tool execution path for tree-sitter-backed code_* tools (code_calls, code_brief enrichment)

## Do NOT delete

- `src/lsp/register-tools.ts` — keep as library code
- `src/tree-sitter/register-tools.ts` — keep as library code
- `src/lsp/tool-actions.ts` — keep (code_health may reference it indirectly via LSP service)
- `src/tree-sitter/tool-actions.ts` — keep
- `src/lsp/tool-specs.ts` — keep (defines types used elsewhere)
- `src/tree-sitter/tool-specs.ts` — keep (defines types used elsewhere)
- `src/lsp/guidance.ts` — keep (may be used by tests)
- `src/tree-sitter/guidance.ts` — keep (may be used by tests)

## Verification

```bash
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json
```

Should compile without errors. Runtime behavior: LSP lifecycle still starts on session_start, tree-sitter still initializes, code_* tools still work.
