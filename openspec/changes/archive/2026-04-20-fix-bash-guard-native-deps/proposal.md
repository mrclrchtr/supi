## Why

The `fix-lsp-md-guidance` change introduced `tree-sitter` and `tree-sitter-bash` as native C++ dependencies for bash command parsing in the soft-nudge feature. This creates three problems: consumers of `supi-lsp` need a working C++ compiler toolchain, the pnpm patch (bumping to C++20) doesn't reach npm installs, and `tree-sitter` is missing from `onlyBuiltDependencies` causing silent build failures. Additionally, the parser is instantiated at module scope so a broken native build crashes all of `supi-lsp`, and `directoryContainsSupportedSource` does unbounded recursive FS traversal.

## What Changes

- Replace native `tree-sitter` with `web-tree-sitter` and load the bundled `tree-sitter-bash.wasm` artifact shipped in the `tree-sitter-bash` package
- Only load `tree-sitter-bash.wasm` at runtime from the `tree-sitter-bash` package
- Fire-and-forget parser initialization at session start — `shouldSuggestLsp` returns `null` until the parser is ready, adds zero latency to tool results, and logs a warning on initialization failure while allowing future sessions to retry
- Remove all native build scaffolding: `patches/tree-sitter@0.25.0.patch`, `scripts/rebuild-tree-sitter.cjs`, `node-gyp` devDep, `pnpm tree-sitter:rebuild` script, `onlyBuiltDependencies` and `patchedDependencies` entries for tree-sitter
- Cap directory traversal in `directoryContainsSupportedSource` at depth 5 / 1000 files; skip over-limit deep subtrees with a warning and stop the full scan only when the global file budget is exhausted
- Remove spurious `as any` cast on `updateLspUi(ctx, ...)` in `lsp.ts`

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `bash-guard-soft-nudge`: Parser changes from synchronous native tree-sitter to async WASM-based web-tree-sitter with fire-and-forget initialization and bounded directory traversal. No behavioral changes to the nudge contract.

## Impact

- `packages/supi-lsp/package.json` — swap `dependencies` from `tree-sitter` to `web-tree-sitter` while continuing to source the bash grammar from `tree-sitter-bash`
- `package.json` — add `web-tree-sitter` and `tree-sitter-bash` dependencies at the repo root so `pi install git:github.com/mrclrchtr/supi` and root-path installs can resolve the LSP extension's runtime imports
- `packages/supi-lsp/bash-guard.ts` — change imports, make parser init async with lazy singleton, add traversal limits
- `packages/supi-lsp/lsp.ts` — trigger parser init at session start, remove `as any` cast
- `package.json` — remove `node-gyp` devDep and `tree-sitter:rebuild` script
- `pnpm-workspace.yaml` — remove `tree-sitter-bash` from `onlyBuiltDependencies`, remove `patchedDependencies` section
- `patches/tree-sitter@0.25.0.patch` — delete
- `scripts/rebuild-tree-sitter.cjs` — delete
- `pnpm-lock.yaml` — regenerated after dependency swap
