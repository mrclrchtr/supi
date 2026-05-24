# Task 2: Update package.json scripts — single tsc -b command

Replace the serial bash `for` loops in root `package.json`:

**Remove** `typecheck:tests` script entirely.

**Replace** `typecheck`:
```json
// Before
"typecheck": "for p in packages/*/tsconfig.json; do tsc --noEmit -p \"$p\" || exit 1; done",
// After
"typecheck": "tsc -b packages/*/tsconfig.json packages/*/__tests__/tsconfig.json",
```

**Update** `verify` — remove `pnpm typecheck:tests` from the chain:
```json
// Before
"verify": "pnpm ... && pnpm typecheck && pnpm typecheck:tests && pnpm biome:ai && pnpm test && pnpm pack:check && pnpm pack:verify",
// After
"verify": "pnpm ... && pnpm typecheck && pnpm biome:ai && pnpm test && pnpm pack:check && pnpm pack:verify",
```

`biome:ai` must stay before `test`.

**Verification**: `grep typecheck package.json` shows only the new single command, no `typecheck:tests`. `pnpm typecheck` executes without error.
