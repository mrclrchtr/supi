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
- Caching parsed syntax trees across separate service calls in v1 (each call re-parses the file)

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

**Public API contract:**
- Export the service surface from the package root so peer extensions can import it from `@mrclrchtr/supi-tree-sitter` rather than internal files.
- Provide a service factory or session acquisition function that owns parser/grammar reuse for the current pi session.
- Expose typed result unions for success, unsupported-language, validation/query errors, file access errors, and runtime failures so callers do not need to parse tool markdown.
- Keep raw Tree-sitter parser objects internal by default; expose structured parse/query data and only expose raw nodes where the type contract is deliberate and documented.

**Service surface:**
- detect whether a file/language is supported
- resolve requested file paths consistently, with relative paths interpreted from the current pi/session working directory
- parse a file into a structured parse result with source metadata and an opaque/internal tree handle suitable for package services
- run Tree-sitter queries against a file
- extract outline/symbol information
- extract imports and exports
- locate the smallest relevant node at a given line/column

**Alternatives considered:**
- Tool-first design with internal helpers growing afterward — faster initially, but tends to produce leaky, agent-shaped internals
- Raw parser export only — too low-level for practical extension reuse

### 3. Ship a tight v1 action set

**Decision:** The `tree_sitter` tool exposes five actions in v1: `outline`, `imports`, `exports`, `node_at`, and `query`.

**Rationale:** These are the smallest actions that prove value for direct use and cover the structural needs of the planned `supi-code-intelligence` layer. `imports` and `exports` are separate actions because agents often ask for one direction of module structure, while the underlying service may share one extraction pass for both.

**Alternatives considered:**
- Add `parse` or full AST dumps — too verbose and low-level for normal agent use
- Combine imports and exports under a generic `module` action — compact, but less discoverable and less aligned with common agent questions
- Add higher-order actions such as `brief` or `affected` — those belong in `supi-code-intelligence`, not this package

### 4. Support TypeScript/JavaScript first

**Decision:** v1 SHALL support the languages immediately useful in this repository: TypeScript, TSX, JavaScript, JSX, MJS, CJS, MTS, and CTS.

**Rationale:** SuPi itself is a TypeScript monorepo, so this gives immediate value and keeps scope tight. The runtime and registry design should make future grammar additions straightforward without requiring a redesign.

**Alternatives considered:**
- Multi-language launch — appealing long term, but increases dependency, testing, and packaging complexity before the substrate is proven
- TypeScript only — simpler, but misses closely related JavaScript file support that shares nearly the same grammar family

### 5. Restore the prior WebAssembly Tree-sitter setup

**Decision:** Use the proven WASM setup from commit `b48ba23e` as the implementation model: `web-tree-sitter` as the runtime, npm grammar packages for JavaScript/TypeScript, `createRequire(import.meta.url)` plus `require.resolve(<grammar>/package.json)` to locate packaged `.wasm` grammar assets, and lazy `Parser.init()` / `Language.load()` initialization.

**Rationale:** This pattern already worked in this repository for the bash guard and matches SuPi's no-build-step model. It avoids native compilation, resolves assets relative to the installed package rather than the current working directory, and should work from both local workspace installs and published packages when the package `files` entries include the needed TypeScript source and grammar dependencies.

**Required asset model:**
- Declare `web-tree-sitter`, `tree-sitter-javascript`, and `tree-sitter-typescript` as runtime peer dependencies, with development/test dependencies added where needed for local verification.
- Ensure the `@mrclrchtr/supi` meta-package install surface also satisfies those runtime peers so wrapper installs can resolve grammar assets without extra repository context.
- Resolve grammar assets from package metadata, not hard-coded repository-relative paths.
- Load `tree-sitter-javascript.wasm` for JavaScript-family files, `tree-sitter-typescript.wasm` for TS/MTS/CTS files, and `tree-sitter-tsx.wasm` for TSX files. The TSX `.wasm` is bundled in the `tree-sitter-typescript` package root alongside the TypeScript `.wasm`; both are resolved through the same `require.resolve("tree-sitter-typescript/package.json")` package directory.
- Cache initialized languages/parsers per service/session and retry initialization after a failed load instead of permanently poisoning the session.

**Packaging note:** Follow the repo convention that runtime-imported packages belong in `peerDependencies`. Package and wrapper smoke tests SHALL verify that those peers resolve when installed directly and through the `@mrclrchtr/supi` meta-package.

**Version constraints:** v1 targets `web-tree-sitter ^0.26.8` and `tree-sitter-javascript` / `tree-sitter-typescript ^0.23.0`. These ranges are compatible with the WASM ABI used in commit `b48ba23e`. Smoke tests SHALL verify that the resolved grammar `.wasm` loads without an ABI/version mismatch at runtime.

**Alternatives considered:**
- Native `tree-sitter` bindings — potentially faster, but adds installation friction and platform-specific risk
- Shelling out to external parsers — not reusable enough and introduces runtime assumptions
- Vendoring copied `.wasm` files into this package — possible, but creates duplication and package-maintenance risk when grammar packages already ship the assets

### 6. Unsupported languages fail clearly and structurally

**Decision:** If a file's language is not supported, `supi-tree-sitter` returns a clear unsupported-language result for both service consumers and tool calls.

**Rationale:** This package should be honest and predictable. Heuristic fallbacks belong in the higher-level `supi-code-intelligence` package, which can decide how to combine LSP, Tree-sitter, and text search.

**Alternatives considered:**
- Regex fallback in this package — muddies responsibility and weakens the contract for service consumers
- Silent empty results — ambiguous and hard for agents to reason about

### 7. Keep outputs compact and structural

**Decision:** Tool output should be compact markdown/text focused on structure, not raw tree dumps.

**Rationale:** Even though the tool is technical, agents still need readable summaries. `outline` should present named structural items, `imports` and `exports` should classify module relationships, `node_at` should identify the node path/type/range, and `query` should summarize matches with file and range references.

**Result bounds:** Tool responses SHALL cap large result sets and include an explicit truncation notice with the number of omitted matches/items when available. Service APIs may expose full structured data to in-process callers, but the agent-facing tool must not dump unbounded query captures, outlines, or import/export lists into context.

**Coordinate convention:** Tool inputs and outputs SHALL use the same user-facing convention as the existing `lsp` tool: 1-based `line` and `character` values. `character` SHALL be interpreted as a UTF-16 code-unit column for compatibility with editor/LSP positions. Any Tree-sitter byte-column positions SHALL be converted at the service boundary before results are returned.

**Alternatives considered:**
- Raw JSON only — good for machines, worse for interactive use
- Full s-expression trees — too noisy for common workflows

## Risks / Trade-offs

- **[WASM grammar packaging complexity]** → Grammar assets and runtime initialization may be awkward in a no-build-step package. **Mitigation:** reuse the commit `b48ba23e` asset-resolution pattern, keep v1 language scope narrow, add package/dry-run checks, and test from both direct package and meta-package wrapper paths.
- **[Tool overlap with LSP symbols]** → `outline` may appear similar to `lsp symbols`. **Mitigation:** keep the positioning explicit: `supi-lsp` is semantic/server-backed, `supi-tree-sitter` is structural/parser-backed and works without LSP.
- **[Future pressure to add smart analysis here]** → Users may ask for higher-level features once the substrate exists. **Mitigation:** document the package boundary clearly and keep brief/affected/callers in `supi-code-intelligence`.
- **[Grammar differences vs language-server truth]** → Structural extraction may not perfectly match LSP semantics. **Mitigation:** treat Tree-sitter as structural truth only; future higher-level synthesis will prefer LSP where semantics matter.
- **[Coordinate conversion mistakes]** → Tree-sitter runtime positions may not match user-facing editor positions. **Mitigation:** centralize conversion in the service boundary and test non-ASCII source cases.
- **[Unbounded tool output]** → Broad queries or generated files could flood agent context. **Mitigation:** cap tool-formatted results and report truncation explicitly.

## Migration Plan

- Add `packages/supi-tree-sitter/` as a new standalone workspace package
- Register the extension in the root `package.json` pi manifest
- Keep the package isolated from existing extension behavior; no migration or breaking changes are required for current users
- Future `supi-code-intelligence` work can depend on this package without changing the `supi-tree-sitter` public contract

## Open Questions

- None
