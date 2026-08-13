# CLAUDE.md

## Scope

`@mrclrchtr/supi-code-runtime` is a library-only package that owns the shared code-understanding contracts used across the stack. It has no pi extension surface.

## Key files

- `src/api.ts` — explicit public API surface
- `src/types.ts` — canonical shared value/result types (includes refactor types: `RefactorOperation`, `RefactorRequest`, `RefactorResult`, `WorkspaceEdit`, `FileEdit`, `DisambiguationCandidate`)
- `src/query-result.ts` — typed read-query outcomes and constructors (`completed | partial | unavailable`)
- `src/capability/types.ts` — capability interfaces (`SemanticProvider`, `StructuralProvider`) and availability states (`CapabilityState`)
- `src/workspace/runtime.ts` — workspace-scoped capability broker; one instance per `Symbol.for` global singleton, manages both semantic (with refactor metadata) and structural slots

## Guidelines

- Keep the API minimal and package-agnostic.
- Do not add pi tool registration or extension exports here.
- Capability interfaces should be stable interfaces, not classes.
- Read-only semantic queries use `CodeQueryResult<T>`; preserve completed empty data separately from partial or unavailable collection.
- Availability states must distinguish pending, ready, inactive, disabled, and unavailable.
- When adding new capability types, update the capability interfaces and `WorkspaceCapabilities` runtime snapshot.
- `CodeRequestControl` is optional request metadata with an Abort Signal and absolute deadline. Adapters preserve the exact value. Cooperative substrates use the shared interruption helpers; use name-based deadline recognition across bundled package copies.
- `SemanticProvider` may optionally expose a generic `refactor(request)` method plus lower-level `rename` and `codeActions` helpers. The broker computes `refactorAvailable` automatically from provider method existence — do not introduce a third independent broker slot for refactoring.
- `RefactorRequest` carries the requested operation, target file/position, and any operation-specific fields such as `newName` or `destination`.
- `RefactorResult` is a discriminated union: `precise` edits for safe direct apply, `ambiguous` candidates for disambiguation, and `unavailable` for when no refactor is possible.
- File/resource operations such as `rename_file` and `move_file` should stay explicit unavailable results until shared resource-edit and rollback semantics exist in the runtime.

## Gotchas

- The workspace runtime uses `Symbol.for("@mrclrchtr/supi-code-runtime/runtime")` for a process-wide singleton — jiti/symlinked duplicate modules share the same broker instance; never create multiple brokers for the same workspace.
- Capability interfaces (`SemanticProvider`, `StructuralProvider`) are interfaces, not classes — the broker accepts any object satisfying the contract, enabling test fakes and adapter composition without coupling to a base class.
- `RefactorResult` is a discriminated union (`precise | ambiguous | unavailable`) — consumers must exhaustively narrow on the `kind` field; adding a new variant breaks all non-exhaustive consumers.
- File/resource operations such as `rename_file` and `move_file` return explicit `unavailable` results — shared resource-edit and rollback semantics don't exist yet in the runtime; do not add partial implementations.

## No pi extension

This package must remain a pure library: no `pi.extensions`, no `src/extension.ts`, no tool registration.
