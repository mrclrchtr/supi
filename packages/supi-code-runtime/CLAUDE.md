# @mrclrchtr/supi-code-runtime

Shared workspace context, provider contracts, and canonical types for the
code-understanding stack.

## Scope

Library-only package with no pi extension surface. Other SuPi packages import it
through `@mrclrchtr/supi-code-runtime/api`.

## Source layout

```text
src/
  api.ts              — public export surface
  index.ts            — public export surface (identical to api.ts)
  types.ts            — canonical shared types
  provider/
    types.ts          — SemanticProvider and StructuralProvider contracts
  session/
    service-registry.ts  — shared workspace-scoped service registry
    workspace-session.ts — workspace session context primitives
```

## Conventions

- Keep the public API deliberate and small. Prefer focused subpath exports
  (`./api`) over broad barrel re-exports.
- All types, interfaces, and exports must be stable before other packages
  migrate to them.
- Test all provider contract behavior with unit tests before migrating
  producers or consumers.
