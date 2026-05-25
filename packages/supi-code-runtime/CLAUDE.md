# CLAUDE.md

## Scope

`@mrclrchtr/supi-code-runtime` is a library-only package that owns the shared code-understanding contracts used across the stack. It has no pi extension surface.

## Key files

- `src/api.ts` — explicit public API surface
- `src/types.ts` — canonical shared value/result types
- `src/capability/types.ts` — capability interfaces and availability states
- `src/workspace/runtime.ts` — workspace-scoped capability registry
- `src/workspace/context.ts` — typed request context helper for consumers

## Guidelines

- Keep the API minimal and package-agnostic.
- Do not add pi tool registration or extension exports here.
- Capability interfaces should be stable interfaces, not classes.
- Availability states must distinguish pending, ready, inactive, disabled, and unavailable.
- When adding new capability types, add them to the registry and context helper.

## No pi extension

This package must remain a pure library: no `pi.extensions`, no `src/extension.ts`, no tool registration.
