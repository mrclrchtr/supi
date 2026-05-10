## Context

The function `createInputSubmenu` appears verbatim in two packages:

- `packages/supi-bash-timeout/src/settings-registration.ts` (~lines 58–88)
- `packages/supi-claude-md/src/settings-registration.ts` (~lines 123–153)

It creates a pi-tui `Input`-backed submenu component with enter-to-confirm / escape-to-cancel handling. Both implementations are identical — they import the same `Input`, `Key`, `matchesKey` from `@earendil-works/pi-tui`, create an `Input` instance, set its value, and return `{ render, invalidate, handleInput }`.

## What to do

1. Export `createInputSubmenu` from `@mrclrchtr/supi-core` (e.g. in `settings-ui.ts` or a new `settings-input.ts`):

```ts
import { Input, Key, matchesKey } from "@earendil-works/pi-tui";

export function createInputSubmenu(
  currentValue: string,
  label: string,
  done: (selectedValue?: string) => void,
) { ... }
```

2. Replace both in-package copies with imports from `@mrclrchtr/supi-core`.

3. Ensure `@earendil-works/pi-tui` is already a peerDependency of `supi-core` (it should be, since `settings-ui.ts` imports from it).

## Pre-validation

Read both copies of `createInputSubmenu`:
- `packages/supi-bash-timeout/src/settings-registration.ts` (lines ~58-88)
- `packages/supi-claude-md/src/settings-registration.ts` (lines ~123-153)

Verify they are exactly identical in behavior. Check:
- Same imports, same function signature, same return shape
- Same enter/escape handling logic
- No package-specific customizations that differ

Then verify:
- `supi-core` already has `@earendil-works/pi-tui` in dependencies/peerDependencies
- `bash-timeout` and `claude-md` already depend on `@mrclrchtr/supi-core`
- After extraction, both settings-registration files still pass typecheck

## Files affected
- `packages/supi-core/src/settings-ui.ts` (or new `settings-input.ts`) — add export
- `packages/supi-core/src/index.ts` — re-export
- `packages/supi-bash-timeout/src/settings-registration.ts` — replace with import
- `packages/supi-claude-md/src/settings-registration.ts` — replace with import
