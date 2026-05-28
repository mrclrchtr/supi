# Absorb lsp_hover into code_brief (anchored mode)

Add LSP type/signature hover info to code_brief output when called with anchored coordinates (file + line + character).

## Design

The `SessionLspService` already has a `hover(filePath, position)` method returning `Hover` (from vscode-languageserver-types). The gap is that the SemanticProvider contract and the CodeProvider composite don't expose it, and code_brief's anchored path doesn't call it.

## Changes

### 1. Add `hover` to SemanticProvider (supi-code-runtime)

Add an optional `hover` method to the SemanticProvider interface. Return type: `Promise<{contents: string; range?: SourceRange} | null>` — a simplified, runtime-agnostic shape rather than leaking vscode-languageserver-types.

### 2. Implement hover in LSP provider (supi-lsp)

Add `hover` to `createLspSemanticProvider` that calls `lsp.hover(filePath, position)` and converts the LSP `Hover` into the simplified shape.

### 3. Forward hover in CodeProvider (supi-code-intelligence)

Add `hover` forwarding in `createCompositeProvider` so it delegates to `semantic.hover`.

### 4. Gather hover in anchored brief use-case (supi-code-intelligence)

In `src/use-case/generate-brief.ts`, extend `gatherTreeSitterContext` (or add a parallel gather step) to call `provider.hover()` when available. Store the result in the `TreeSitterContext` — or better, in a new `HoverContext` shape.

### 5. Render hover in anchored brief output (supi-code-intelligence)

In `src/presentation/markdown/brief.ts`, add a "Hover" section to `renderAnchoredBrief` that shows type/signature info when available.

### 6. Update tests

- Add/update unit tests for the hover gathering path
- Verify test typecheck passes
- Integration test: anchored brief includes hover section when provider is available

### 7. Update docs

Remove "lsp_hover" from the known absorption gaps in CLAUDE.md.

## Notes

- Hover is **best-effort** — if the LSP is unavailable or doesn't return hover for the position, code_brief still works and just omits the section.
- The Hover type from vscode-languageserver-types must not leak into the shared runtime types — use a simplified `{contents: string; range?: {start: {line, character}, end: {line, character}}}` shape.
- Leaf change — no schema changes, no renames, no breaking changes. Purely additive.
