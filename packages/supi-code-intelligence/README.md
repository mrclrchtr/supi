# @mrclrchtr/supi-code-intelligence

SuPi Code Intelligence extension — the main agent-facing code understanding tool for [pi](https://github.com/mariozechner/pi-coding-agent).

Registers a single `code_intel` tool with high-level actions:

- **`brief`** — Architecture overviews and focused briefs for projects, packages, files, or anchored symbols
- **`callers`** — Find call sites for a symbol with grouped, ranked results
- **`callees`** — Best-effort outbound call map for a symbol
- **`implementations`** — Find concrete implementations of interfaces/abstract types
- **`affected`** — Blast-radius analysis with risk assessment before changing shared APIs
- **`pattern`** — Bounded, scope-aware text search with structured output

Injects a compact architecture overview once per session so agents start with structural context.

## Architecture

Composes lower-level services directly:

- **`@mrclrchtr/supi-lsp`** — Semantic truth via LSP (references, symbols, implementations, diagnostics)
- **`@mrclrchtr/supi-tree-sitter`** — Structural extraction (outlines, imports/exports, syntax context)
- **`@mrclrchtr/supi-core`** — Project/root utilities (root walking, known-root mapping, path containment)

Falls back gracefully: LSP → Tree-sitter → text search, with explicit confidence labeling (`semantic`, `structural`, `heuristic`, `unavailable`).

## Install

Included in the `@mrclrchtr/supi` meta-package, or install standalone:

```json
{
  "pi": {
    "packages": ["@mrclrchtr/supi-code-intelligence"]
  }
}
```

## License

MIT
