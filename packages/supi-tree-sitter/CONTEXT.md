# supi-tree-sitter

Tree-sitter integration for PI. Provides AST-based structural code analysis consumed by `supi-code-intelligence`.

See also: `packages/supi-code-intelligence/CONTEXT.md` (Structural request control, Structural analysis, Structural callee) and `packages/supi-code-runtime/CONTEXT.md`.

## Language

**Structural Worker**:
The one long-lived Worker owned by one shared workspace lifecycle or explicitly owned Tree-sitter session. It owns every parser-backed resource, source read, extraction, and cache.
_Avoid_: Worker pool, main-thread parser, generic scheduler

**Structural mailbox**:
The parent-owned fixed FIFO of one active request and at most 32 queued requests. Valid queued work keeps order across a fresh-Worker restart.
_Avoid_: Job queue, priority queue, configurable concurrency

**Structural hard stop**:
Worker termination after an active request does not settle within 250 ms of the parent setting its shared atomic cancellation flag. The active request is not retried and Worker caches become cold.
_Avoid_: Process timeout, cancellation retry

**Worker-cooperative structural cancellation**:
Request interruption observed through asynchronous Worker phases and parser/query progress callbacks. The shared atomic flag stays visible while synchronous WASM blocks the Worker's event loop. Worker isolation keeps Pi's main event loop responsive.
_Avoid_: result-only cancellation, cancel-message-only control, main-thread fallback
