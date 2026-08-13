# supi-tree-sitter

Tree-sitter integration for PI. Provides AST-based structural code analysis consumed by `supi-code-intelligence`.

See also: `packages/supi-code-intelligence/CONTEXT.md` (Structural request control, Structural analysis, Structural callee) and `packages/supi-code-runtime/CONTEXT.md`.

## Language

**Cooperative structural cancellation**:
Request interruption observed before and after asynchronous reads and through Tree-sitter parser/query progress callbacks. Interrupted parser state resets before reuse, and interrupted work cannot publish a cache entry. It does not guarantee that the main event loop stays responsive between synchronous WASM callbacks.
_Avoid_: Worker cancellation, result-only cancellation, main-thread responsiveness
