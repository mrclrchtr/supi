# CLAUDE.md

## Scope

`@mrclrchtr/supi-code-runtime` is a library-only package that owns the shared code-understanding contracts used across the stack. It has no pi extension surface.

## Guidelines

- Keep the API minimal and package-agnostic.
- Keep C-family association validation and matching here so Tree-sitter and LSP use one rule set. The resolver only changes existing C-family suffixes. It does not load config or apply trust policy.
- Do not add pi tool registration or extension exports here.
- Capability interfaces remain interfaces, not classes, so adapters and test fakes can satisfy the contract without inheritance.
- Read-only semantic queries use `CodeQueryResult<T>`; preserve completed empty data separately from partial or unavailable collection.
- Availability states must distinguish pending, ready, inactive, disabled, and unavailable.
- When adding new capability types, update the capability interfaces and `WorkspaceCapabilities` runtime snapshot.
- `CodeRequestControl` is optional request metadata with an Abort Signal and absolute deadline. Adapters preserve the exact value. Cooperative substrates use the shared interruption helpers; use name-based deadline recognition across bundled package copies.
- `SemanticProvider` may optionally expose a generic `refactor(request)` method plus lower-level `rename` and `codeActions` helpers. The broker computes `refactorAvailable` automatically from provider method existence — do not introduce a third independent broker slot for refactoring.
- Consumers must exhaustively narrow `RefactorResult.kind`: `precise` edits for safe direct apply, `ambiguous` candidates for disambiguation, or `unavailable` when no refactor is possible.
- File/resource operations such as `rename_file` and `move_file` must return explicit `unavailable` results until shared resource-edit and rollback semantics exist; do not add partial implementations.

## Gotchas

- The workspace runtime uses `Symbol.for("@mrclrchtr/supi-code-runtime/runtime")` for a process-wide singleton — jiti/symlinked duplicate modules share the same broker instance; never create multiple brokers for the same workspace.
