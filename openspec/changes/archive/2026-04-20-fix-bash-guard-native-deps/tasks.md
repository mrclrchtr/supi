## 1. Swap dependencies

- [x] 1.1 Replace native `tree-sitter` runtime with `web-tree-sitter` and source the bash grammar from the bundled `tree-sitter-bash.wasm` artifact in `tree-sitter-bash`
- [x] 1.1a Add `web-tree-sitter` and `tree-sitter-bash` to the repo root `package.json` so root git/path installs can resolve `packages/supi-lsp/lsp.ts`
- [x] 1.2 Remove `node-gyp` from root `package.json` devDependencies
- [x] 1.3 Remove `tree-sitter:rebuild` script from root `package.json`
- [x] 1.4 Remove `tree-sitter-bash` from `onlyBuiltDependencies` and remove `patchedDependencies` section in `pnpm-workspace.yaml`
- [x] 1.5 Delete `patches/tree-sitter@0.25.0.patch`
- [x] 1.6 Delete `scripts/rebuild-tree-sitter.cjs`
- [x] 1.7 Run `pnpm install` to regenerate `pnpm-lock.yaml`

## 2. Refactor bash-guard to WASM parser

- [x] 2.1 Replace `tree-sitter` and `tree-sitter-bash/bindings/node` imports with `web-tree-sitter` and a resolved path to the bundled `tree-sitter-bash.wasm` file
- [x] 2.2 Remove module-level `BASH_PARSER` instantiation; replace with a lazy singleton (`parser: Parser | null`) set by async init
- [x] 2.3 Add `initBashParser(): Promise<void>` that calls `Parser.init()`, loads `tree-sitter-bash.wasm` via `Language.load()`, creates the parser, stores it, logs failures, and clears failed init state so later sessions can retry.
- [x] 2.4 Update `parseSearchInvocation` to return `null` when parser is not yet ready
- [x] 2.5 Add depth (5) and file count (1000) limits to `directoryContainsSupportedSource`, skipping only over-limit deep subtrees with warnings and aborting the full scan only on global file-budget exhaustion

## 3. Wire parser init into session lifecycle

- [x] 3.1 Export `initBashParser` from `bash-guard.ts` and call it fire-and-forget during `session_start` in `lsp.ts`
- [x] 3.2 Remove the `biome-ignore` + `as any` cast on `updateLspUi(ctx, ...)` in `lsp.ts`

## 4. Update tests

- [x] 4.1 Update `guardrails.test.ts` to await parser init before running tests (one-time `beforeAll` calling `initBashParser`)
- [x] 4.2 Add test: `shouldSuggestLsp` returns `null` when parser is not initialized
- [x] 4.3 Add tests for retryable parser initialization, deep-subtree skip warnings, and file-budget warnings/stop behavior
- [x] 4.4 Verify all existing `extractSearchTargets` and `shouldSuggestLsp` tests still pass

## 5. Verify

- [x] 5.1 Run `pnpm typecheck` — no type errors
- [x] 5.2 Run `pnpm test` — all tests pass
- [x] 5.3 Run `pnpm biome:ai` — no lint/format issues
