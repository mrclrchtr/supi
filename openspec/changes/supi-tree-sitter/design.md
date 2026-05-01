## Context

SuPi already has a reusable semantic substrate in `supi-lsp`, but it does not have an equivalent structural substrate for syntax-tree-based analysis. The repo is a pnpm workspace whose extensions are loaded directly as TypeScript by pi, so the new package must avoid heavy build-time assumptions and should be installable in other projects without requiring a custom compile step.

This change is intentionally the lower layer in a larger architecture:
- `supi-lsp` owns live language-server semantics
- `supi-tree-sitter` owns parser/AST-backed structure
- a future `supi-code-intelligence` package will compose both into the main agent-facing experience

The package therefore needs two audiences:
1. **other extensions** that want stable parse/query services
2. **agents** that may use a small technical tool surface directly

## Goals / Non-Goals

**Goals:**
- Provide a reusable Tree-sitter runtime and service API for other SuPi extensions
- Register a small technical `tree_sitter` tool for direct structural inspection
- Support the core structural workflows needed by a future `supi-code-intelligence` package: outline extraction, imports/exports, node-at-position lookup, and query execution
- Be explicit and predictable when a language is unsupported
- Keep the package independently installable and useful, without trying to own the full code-understanding UX

**Non-Goals:**
- Replacing `supi-lsp` or duplicating LSP features such as hover, rename, references, or diagnostics
- Providing architecture briefs, blast-radius analysis, or prompt injection
- Supporting every Tree-sitter grammar in v1
- Falling back to regex or grep inside `supi-tree-sitter` when parsing is unavailable
- Building a project-wide persistent index or cache in v1

## Decisions

### 1. Use an implementation-shaped package and tool

**Decision:** Create a technical package `supi-tree-sitter` and register a technical tool named `tree_sitter`.

**Rationale:** This package is a substrate, not the main user-facing product. Making the boundary explicitly implementation-shaped matches `supi-lsp`, keeps responsibilities crisp, and leaves `supi-code-intelligence` as the single opinionated user-facing layer.

**Alternatives considered:**
- Capability-shaped package/tool such as `code-structure` — better end-user wording, but it blurs the boundary with the future `supi-code-intelligence` layer
- No direct tool at all — cleaner internally, but reduces independent usefulness and makes it harder to validate the substrate directly

### 2. Reusable service layer first, tool second

**Decision:** Center the package around a reusable service API, with the tool implemented as a thin wrapper around those services.

**Rationale:** The long-term value is reuse by other extensions. The `tree_sitter` tool should exercise the same core parse/query functions that future extensions consume so the package evolves around stable internals rather than tool-specific logic.

**Service surface:**
- parse a file into a syntax tree
- detect whether a file/language is supported
- run Tree-sitter queries against a file
- extract outline/symbol information
- extract imports/exports
- locate the smallest relevant node at a given line/column

**Alternatives considered:**
- Tool-first design with internal helpers growing afterward — faster initially, but tends to produce leaky, agent-shaped internals
- Raw parser export only — too low-level for practical extension reuse

### 3. Ship a tight v1 action set

**Decision:** The `tree_sitter` tool exposes four actions in v1: `outline`, `imports`, `node_at`, and `query`.

**Rationale:** These are the smallest actions that prove value for direct use and cover the structural needs of the planned `supi-code-intelligence` layer. They are also naturally backed by shared services.

**Alternatives considered:**
- Add `parse` or full AST dumps — too verbose and low-level for normal agent use
- Add higher-order actions such as `brief` or `affected` — those belong in `supi-code-intelligence`, not this package

### 4. Support TypeScript/JavaScript first

**Decision:** v1 SHALL support the languages immediately useful in this repository: TypeScript, TSX, JavaScript, JSX, MJS, CJS, MTS, and CTS.

**Rationale:** SuPi itself is a TypeScript monorepo, so this gives immediate value and keeps scope tight. The runtime and registry design should make future grammar additions straightforward without requiring a redesign.

**Alternatives considered:**
- Multi-language launch — appealing long term, but increases dependency, testing, and packaging complexity before the substrate is proven
- TypeScript only — simpler, but misses closely related JavaScript file support that shares nearly the same grammar family

### 5. Use bundled WebAssembly grammars instead of native compilation

**Decision:** Use a WebAssembly-based Tree-sitter runtime with packaged grammar assets rather than native Node bindings.

**Rationale:** SuPi extensions are loaded directly from the working tree and should remain easy to install across macOS/Linux without a native build toolchain. WASM grammars are more portable and fit the repo's no-build-step extension model better.

**Alternatives considered:**
- Native `tree-sitter` bindings — potentially faster, but adds installation friction and platform-specific risk
- Shelling out to external parsers — not reusable enough and introduces runtime assumptions

### 6. Unsupported languages fail clearly and structurally

**Decision:** If a file's language is not supported, `supi-tree-sitter` returns a clear unsupported-language result for both service consumers and tool calls.

**Rationale:** This package should be honest and predictable. Heuristic fallbacks belong in the higher-level `supi-code-intelligence` package, which can decide how to combine LSP, Tree-sitter, and text search.

**Alternatives considered:**
- Regex fallback in this package — muddies responsibility and weakens the contract for service consumers
- Silent empty results — ambiguous and hard for agents to reason about

### 7. Keep outputs compact and structural

**Decision:** Tool output should be compact markdown/text focused on structure, not raw tree dumps.

**Rationale:** Even though the tool is technical, agents still need readable summaries. `outline` should present named structural items, `imports` should classify dependencies, `node_at` should identify the node path/type/range, and `query` should summarize matches with file and range references.

**Alternatives considered:**
- Raw JSON only — good for machines, worse for interactive use
- Full s-expression trees — too noisy for common workflows

## Risks / Trade-offs

- **[WASM grammar packaging complexity]** → Grammar assets and runtime initialization may be awkward in a no-build-step package. **Mitigation:** keep v1 language scope narrow and package only the JS/TS grammar family first.
- **[Tool overlap with LSP symbols]** → `outline` may appear similar to `lsp symbols`. **Mitigation:** keep the positioning explicit: `supi-lsp` is semantic/server-backed, `supi-tree-sitter` is structural/parser-backed and works without LSP.
- **[Future pressure to add smart analysis here]** → Users may ask for higher-level features once the substrate exists. **Mitigation:** document the package boundary clearly and keep brief/affected/callers in `supi-code-intelligence`.
- **[Grammar differences vs language-server truth]** → Structural extraction may not perfectly match LSP semantics. **Mitigation:** treat Tree-sitter as structural truth only; future higher-level synthesis will prefer LSP where semantics matter.

## Migration Plan

- Add `packages/supi-tree-sitter/` as a new standalone workspace package
- Register the extension in the root `package.json` pi manifest
- Keep the package isolated from existing extension behavior; no migration or breaking changes are required for current users
- Future `supi-code-intelligence` work can depend on this package without changing the `supi-tree-sitter` public contract

## Open Questions

- Whether reusable project-root scanning belongs in `supi-core` or should remain outside this package until `supi-code-intelligence` lands
