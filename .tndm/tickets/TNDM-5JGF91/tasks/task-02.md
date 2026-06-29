# Task 2: Update package.json scripts: replace pack:verify loop, remove pack:check from verify chain

## Goal

Update `package.json` scripts to use the new parallel runner and consolidate the verify pipeline.

## Changes

**`pack:verify`** — replace the serial `for` loop:
```jsonc
"pack:verify": "node scripts/pack-all.mjs"
```

**`verify`** — remove `pack:check` from the chain:
```jsonc
"verify": "pnpm --filter @mrclrchtr/supi-tree-sitter check:kotlin-wasm && pnpm --filter @mrclrchtr/supi-tree-sitter check:sql-wasm && pnpm typecheck && pnpm biome:ai && pnpm test && pnpm pack:verify"
```

**`pack:check`** — keep as standalone convenience command (no change).

## Verification

```bash
pnpm pack:verify    # should invoke scripts/pack-all.mjs
pnpm verify         # should NOT include pack:check
```
