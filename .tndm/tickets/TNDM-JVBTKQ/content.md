## Brainstorming Outcome
**Problem**: The top-level action-discriminated union for the `lsp` tool breaks provider function-schema validation because the tool schema no longer has a top-level JSON Schema `type: "object"`.
**Recommended approach**: Change the `lsp` tool to a breaking API with a top-level object `{ action, args }`. Keep the tool name the same, keep the top-level schema as an object, and move action-specific parameter strictness into `args`.
**Why**: This preserves a single `lsp` tool while giving a more explicit action contract and avoiding the provider limitation that rejected the previous top-level union.
**Constraints / non-goals**: No new `symbol_hover` semantics. No backward-compatibility shim unless requested. If nested `args` unions still prove incompatible with provider schema requirements, stop and pivot rather than guessing.
**Open questions**: Whether nested `args` unions are accepted by the provider; verification must prove this.
**Ticket**: TNDM-JVBTKQ