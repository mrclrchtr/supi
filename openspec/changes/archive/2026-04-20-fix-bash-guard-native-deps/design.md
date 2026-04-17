## Context

The bash-guard feature in `supi-lsp` parses shell commands using tree-sitter to extract search targets and decide whether to nudge the agent toward LSP. The current implementation uses the native Node.js bindings (`tree-sitter` + `tree-sitter-bash`), which require C++ compilation at install time. This was discovered during code review to have packaging gaps: the pnpm patch for C++20 doesn't reach npm consumers, `tree-sitter` is missing from `onlyBuiltDependencies`, and the module-level parser instantiation makes `supi-lsp` fail entirely if the native build breaks.

The nudge feature is informational-only — missing a nudge is invisible to the user. This makes it a poor candidate for a hard native dependency.

## Goals / Non-Goals

**Goals:**
- Eliminate native C++ compilation requirement for `supi-lsp` consumers
- Make parser initialization non-blocking and failure-isolated
- Bound the directory traversal to prevent event-loop stalls in large repos
- Remove all native build scaffolding (patch, rebuild script, `node-gyp`, workspace config)

**Non-Goals:**
- Changing nudge semantics or the `shouldSuggestLsp` contract
- Changing the AST evaluation logic (`evaluateNode`, `evaluateCommand`, etc.)
- Reducing the `tree-sitter-wasms` install size (accepted trade-off — only the bash grammar is loaded at runtime)

## Decisions

### 1. Use `web-tree-sitter` with the bundled `tree-sitter-bash.wasm` artifact

**Decision**: Replace the native `tree-sitter` runtime with `web-tree-sitter` (WASM runtime, ~4.5 MB) and load the official `tree-sitter-bash.wasm` file shipped inside the `tree-sitter-bash` package.

**Rationale**: The official `tree-sitter-bash` package already ships a compatible `tree-sitter-bash.wasm` artifact. Using that file avoids introducing a second grammar package and keeps the grammar/runtime pairing aligned with upstream releases. The tree structure and node types are identical to the native bindings, so the existing evaluation code (`evaluateNode`, `evaluateCommand`, `getLiteralToken`, etc.) requires only import changes — no logic changes.

**Alternatives considered**:
- Use `tree-sitter-wasms` for prebuilt grammars — rejected because its bash wasm artifact is not compatible with `web-tree-sitter` (`dylink` vs `dylink.0`).
- Keep native bindings and fix packaging — still requires C++ toolchain for all consumers.
- Pre-build `tree-sitter-bash.wasm` and commit to repo — avoids runtime package lookup but adds a binary artifact to version control and a manual rebuild step when upgrading grammars.
- Drop tree-sitter entirely for a regex tokenizer — loses AST robustness for compound commands (`cd && rg`), quoted strings, and flag parsing. The existing code is well-tested and works.

### 2. Fire-and-forget parser initialization at session start with retry-on-failure

**Decision**: Kick off `Parser.init()` + `Language.load(bashWasmPath)` during `session_start` as a fire-and-forget promise. Store the resolved parser in a module-level variable. `shouldSuggestLsp` checks if the parser is ready; if not, returns `null` immediately. If initialization fails, log a warning and clear the in-flight promise so later sessions can retry.

**Rationale**: The nudge is purely informational — missing it while the parser loads (~50-200ms) is invisible. This guarantees zero latency added to tool results and isolates the blast radius: if WASM loading fails, only the nudge degrades, not the rest of `supi-lsp`. Clearing the failed promise prevents a one-time transient failure from disabling nudges for the rest of the process lifetime.

**Alternatives considered**:
- Lazy init on first bash `tool_result` — delays init until needed but risks the first nudge being missed in a session that starts with a bash command.
- Await init in `tool_result` handler — simplest code but adds latency to the first bash result.

### 3. Cap directory traversal at depth 5 / 1000 files

**Decision**: Add a `maxDepth` (5) and `maxFilesVisited` (1000) limit to `directoryContainsSupportedSource`. When a subtree exceeds the depth limit, skip that subtree, log a warning, and continue scanning remaining pending directories. When the global file budget is exhausted, stop traversal, log a warning, and return `false` (no nudge).

**Rationale**: In large monorepos, `rg "pattern" ./` would trigger an unbounded synchronous walk. Depth 5 covers all reasonable project layouts (e.g., `packages/supi-lsp/__tests__/fixtures/`). 1000 files is enough to find a supported source file in any normal project tree. Skipping only the over-limit subtree avoids making results depend on directory traversal order while still bounding work.

### 4. Keep runtime dependencies resolvable from both package entrypoints

**Decision**: Add `web-tree-sitter` and `tree-sitter-bash` to the repository root `package.json` as well as `packages/supi-lsp/package.json`.

**Rationale**: The repository root remains a documented install target for `pi install git:github.com/mrclrchtr/supi` and root-path installs. Since `packages/supi-lsp/lsp.ts` is loaded through the root package in that flow, its runtime imports and `require.resolve("tree-sitter-bash/package.json")` must be satisfiable from the root install as well as the standalone package.

### 5. Remove the `as any` cast on `updateLspUi`

**Decision**: Remove the `biome-ignore` + `as any` cast added in the previous change. Both `updateLspUi` and the `tool_result` handler receive `ExtensionContext` — the cast is unnecessary.

**Rationale**: The types already match. The cast was added by mistake during the refactor.

## Risks / Trade-offs

- **`tree-sitter-bash` still ships native bindings alongside the wasm artifact** → We only load the bundled `.wasm` file at runtime. The package includes prebuilt native binaries for common platforms, so install friction is significantly lower than the raw `tree-sitter` dependency.
- **WASM parser init could fail** → `shouldSuggestLsp` returns `null`, nudge degrades to no-op. Log the error for debuggability and clear the failed promise so a later session can retry.
- **`web-tree-sitter` API is async** → Already handled by the fire-and-forget pattern. The parsing itself (`parser.parse()`) is synchronous once initialized.
- **Directory traversal cap could miss deeply nested supported files** → Depth 5 / 1000 files is generous. Deep over-limit subtrees are skipped with a warning, and global file-budget exhaustion stops the scan with a warning. False negatives produce no nudge, which is harmless.
