## Context

SuPi is converging on a layered code-understanding stack:
- `supi-lsp` for live semantic analysis through language servers
- `supi-tree-sitter` for parser-backed structural analysis
- a future `supi-code-intelligence` package as the single agent-facing product above both

Today those substrate packages are uneven. `supi-tree-sitter` already has a clear public root API (`createTreeSitterSession`) and a thin extension wrapper, while `supi-lsp` mostly exposes behavior through its extension entrypoint and internal files. That makes the LSP layer harder to reuse safely from peer extensions and encourages imports from private modules. The current `lsp` tool also still relies on ambient process path resolution and thrown parameter errors in places where `supi-tree-sitter` already uses explicit validation. Separately, `supi-tree-sitter` prompt guidance currently assumes the presence of a sibling `lsp` tool even though the package is intended to remain independently installable.

This change is a substrate-stabilization pass before `supi-code-intelligence` implementation. It does not try to move high-level architecture briefs, fallback orchestration, or prompt-injection ownership down into the lower layers. It instead makes both substrate packages cleaner, more consistent, and safer to compose.

## Goals / Non-Goals

**Goals:**
- Give `@mrclrchtr/supi-lsp` a documented, importable public library surface in addition to its standalone extension entrypoint.
- Expose session-scoped LSP service acquisition so peer extensions can reuse live LSP state without starting duplicate server sets.
- Add `textDocument/implementation` support to the reusable LSP layer for future semantic analyses.
- Align `lsp` tool validation and file-path resolution with explicit session-cwd semantics.
- Make `tree_sitter` prompt guidance standalone-safe.
- Refresh package documentation so published contracts match actual behavior and the planned layering.

**Non-Goals:**
- Creating `supi-code-intelligence` itself.
- Replacing the existing `lsp` or `tree_sitter` tools with a new unified tool.
- Expanding the user-facing `lsp` tool action surface beyond the current contract.
- Moving high-level code-understanding UX, briefs, or impact analysis into the substrate packages.
- Introducing a persistent index, file watcher, or background cache.

## Decisions

### 1. Add a public root API to `@mrclrchtr/supi-lsp`
**Decision:** Add `packages/supi-lsp/index.ts` as the documented public entrypoint for reusable LSP services and types, while keeping `lsp.ts` as the standalone pi extension entrypoint.

**Rationale:** This mirrors the successful `supi-tree-sitter` shape: root import for library consumers, separate extension file for agent/tool wiring. It also fixes the current asymmetry where `@mrclrchtr/supi-lsp` is installable as an extension but not cleanly consumable as a library.

**Alternatives considered:**
- *Keep private-file imports as the reuse path* — easiest short-term, but brittle and contrary to the planned layered architecture.
- *Expose the extension entrypoint as the library surface* — conflates runtime wiring with reusable services.
- *Wait for `supi-code-intelligence` and solve it there* — would force the future package to depend on unstable internals.

### 2. Use a synchronous module-level session registry for shared LSP availability
**Decision:** `supi-lsp` will maintain a module-level registry keyed by session `cwd`, updated by the extension lifecycle (`session_start`, `session_shutdown`), and expose a synchronous getter such as `getSessionLspService(cwd)` that returns `ready`, `pending`, `disabled`, or `unavailable` state.

**Rationale:** Peer extensions run in the same process, so module state is the simplest reliable way to share the active LSP runtime. A synchronous getter is enough because consumers do not need a second startup flow — they only need to know whether the shared runtime is available now.

**Representative contract:**
```ts
export type SessionLspServiceState =
  | { kind: "ready"; service: SessionLspService }
  | { kind: "pending" }
  | { kind: "disabled" }
  | { kind: "unavailable"; reason: string };

export function getSessionLspService(cwd: string): SessionLspServiceState;
```

**Alternatives considered:**
- *Async acquisition that waits for readiness* — more complex, and easy for consumers to misuse as a hidden second startup path.
- *Custom pi events or message passing between extensions* — possible, but heavier and less direct than shared module state.
- *Duplicate LSP startup in each consumer* — rejected because it fragments semantic state and wastes resources.

### 3. Expose a service wrapper, not raw `LspManager` internals
**Decision:** The public root API will return a `SessionLspService` wrapper that exposes stable semantic operations and project-inspection helpers, while `LspManager` remains an internal implementation detail.

**Expected public responsibilities:**
- semantic lookups (`hover`, `definition`, `references`, `workspaceSymbol`, `implementation`)
- document structure queries (`documentSymbols`)
- project/runtime awareness (`getProjectServers`, `isSupportedSourceFile`)
- diagnostics-aware helpers needed by higher layers (`getOutstandingDiagnostics`, `getOutstandingDiagnosticSummary`)

**Rationale:** Exposing `LspManager` directly would make the current extension-oriented helper mix part of the public contract, including prompt/UI-adjacent summary helpers that do not belong in a substrate API. A wrapper keeps the reusable contract smaller and more intentional.

**Alternatives considered:**
- *Export `LspManager` directly* — minimal work, but leaks internal structure and makes future cleanup harder.
- *Force reuse through the `lsp` tool text interface* — too stringly typed and loses structured data.

### 4. Add implementation support in the reusable layer, not as a new `lsp` tool action
**Decision:** Add `textDocument/implementation` support to the reusable client/service layer and keep the standalone `lsp` tool surface unchanged in this change.

**Rationale:** This satisfies the future `supi-code-intelligence` prerequisite without expanding the standalone tool contract. The lower-layer tool remains stable for existing users, while peer extensions gain the semantic primitive they need.

**Alternatives considered:**
- *Add an `implementation` tool action now* — useful, but expands the current user-facing tool contract unnecessarily for this stabilization pass.
- *Defer implementation support until `supi-code-intelligence`* — keeps this change smaller, but leaves the substrate incomplete.

### 5. Normalize `lsp` tool validation and file resolution around session `cwd`
**Decision:** Route standalone `lsp` tool actions through explicit parameter-validation helpers and path-resolution helpers bound to the session `cwd`, replacing ambient `process.cwd()` and exception-driven parameter failures.

**Rationale:** This makes `supi-lsp` behave more like `supi-tree-sitter`: clear validation errors, predictable relative-path semantics, and no hidden dependence on process-global state. It also makes standalone installs more trustworthy when consumed outside the SuPi monorepo.

**Alternatives considered:**
- *Leave current behavior and document it better* — does not fix the underlying inconsistency.
- *Expose raw exceptions to callers* — fragile and poor agent-facing UX.

### 6. Keep `tree_sitter` guidance generic and self-contained
**Decision:** Rewrite `supi-tree-sitter` prompt guidance so it describes structural syntax-tree analysis directly and references semantic language-server tooling only in conditional, generic terms.

**Rationale:** `supi-tree-sitter` is intended to be independently installable. Its guidance must stay correct whether or not `supi-lsp` is present. The LSP package can keep owning specific semantic guidance for the `lsp` tool itself.

**Alternatives considered:**
- *Runtime-detect whether `lsp` is installed and switch copy dynamically* — possible, but unnecessary complexity for a small guidance problem.
- *Leave the current hard reference to `lsp`* — contradicts the standalone-package goal.

### 7. Treat documentation cleanup as part of the substrate contract
**Decision:** Update package READMEs and related docs in the same change so they reflect the actual tool surface, current settings model, public import surface, and future layering with `supi-code-intelligence`.

**Rationale:** The review findings include contract drift, not just code shape. Leaving README/package docs stale would preserve the same confusion for future users and for the forthcoming higher-level package.

**Alternatives considered:**
- *Defer docs to a later cleanup* — risks implementing the right shape while continuing to publish the wrong contract.

## Risks / Trade-offs

- **[Registry lifecycle drift]** → A module-level session registry can become stale if `session_shutdown` or reload cleanup misses an edge case. **Mitigation:** have the extension own all registry transitions and cover startup, reload, tree switch, and shutdown paths with tests.
- **[Public API scope creep]** → The new LSP library surface could grow into a second copy of internal manager APIs. **Mitigation:** keep the wrapper intentionally narrow and expose structured semantic operations rather than every manager helper.
- **[Validation output changes]** → Tightening `lsp` tool validation may slightly change error wording seen by agents. **Mitigation:** keep the tool surface stable and only make failures earlier and clearer.
- **[Documentation will drift again]** → README correctness is easy to lose as action surfaces evolve. **Mitigation:** update package docs in the same PR and add focused tests where practical for documented tool/action surfaces.

## Migration Plan

1. Add the public `packages/supi-lsp/index.ts` entrypoint and exported service/types.
2. Update the extension runtime in `lsp.ts` to populate and clear the shared session registry during lifecycle events.
3. Extend the client/service layer with implementation-provider support.
4. Refactor standalone `lsp` tool handlers to use explicit validation and session-cwd-relative path resolution.
5. Rewrite `supi-tree-sitter` prompt guidance to be standalone-safe.
6. Refresh package documentation for `supi-lsp` and `supi-tree-sitter`.
7. Verify that the standalone tools keep their current action contracts while the new library surface is available to future peer extensions.

## Open Questions

- None. Exact exported type names can be finalized during implementation, but the public shape and responsibilities are settled by this design.
