# CLAUDE.md

## Scope

`@mrclrchtr/supi-code-runtime` is a library-only package that owns the shared code-understanding contracts used across the stack. It has no pi extension surface.

## Key files

- `src/api.ts` — explicit public API surface
- `src/types.ts` — canonical shared value/result types (includes refactor types: `RefactorOperation`, `RefactorRequest`, `RefactorResult`, `WorkspaceEdit`, `FileEdit`, `DisambiguationCandidate`)
- `src/capability/types.ts` — capability interfaces (`SemanticProvider`, `StructuralProvider`) and availability states (`CapabilityState`)
- `src/workspace/runtime.ts` — workspace-scoped capability broker; one instance per `Symbol.for` global singleton, manages both semantic (with refactor metadata) and structural slots
- `src/workspace/context.ts` — typed request context helper for consumers, includes `refactorAvailable` on semantic slot

## Guidelines

- Keep the API minimal and package-agnostic.
- Do not add pi tool registration or extension exports here.
- Capability interfaces should be stable interfaces, not classes.
- Availability states must distinguish pending, ready, inactive, disabled, and unavailable.
- When adding new capability types, add them to the registry and context helper.
- `SemanticProvider` may optionally expose a generic `refactor(request)` method plus lower-level `rename` and `codeActions` helpers. The broker computes `refactorAvailable` automatically from provider method existence — do not introduce a third independent broker slot for refactoring.
- `RefactorRequest` carries the requested operation, target file/position, and any operation-specific fields such as `newName` or `destination`.
- `RefactorResult` is a discriminated union: `precise` edits for safe direct apply, `ambiguous` candidates for disambiguation, and `unavailable` for when no refactor is possible.
- File/resource operations such as `rename_file` and `move_file` should stay explicit unavailable results until shared resource-edit and rollback semantics exist in the runtime.

## No pi extension

This package must remain a pure library: no `pi.extensions`, no `src/extension.ts`, no tool registration.
