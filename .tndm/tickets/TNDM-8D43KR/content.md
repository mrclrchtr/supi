## Brainstorming Outcome
**Problem**: The `lsp` tool exposes a flat parameter schema, so action-specific unsupported params can be silently accepted. This made `symbol_hover` appear to accept `path` even though the action does not support it.
**Recommended approach**: Replace the flat `lsp` tool parameter schema with an action-discriminated union. Keep runtime action behavior unchanged.
**Why**: This makes the tool contract explicit, rejects unsupported params per action, and avoids misleading silent acceptance.
**Constraints / non-goals**: Do not add new `symbol_hover` semantics. Do not change action handler behavior beyond schema-driven validation.
**Open questions**: none
**Ticket**: TNDM-8D43KR
