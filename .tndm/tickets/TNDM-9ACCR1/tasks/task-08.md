# Task 8: Full verification sweep

## Goal
Run the complete CI pipeline to ensure nothing is broken.

## Commands
```bash
pnpm install
pnpm exec tsc -b packages/*/tsconfig.json packages/*/__tests__/tsconfig.json
pnpm exec biome check
pnpm vitest run
pnpm pack:verify
```

## Additional spot checks
- Verify `supi-core` no longer appears in `pi list` (in dev, it's loaded via root workspace, but as a package it has no extensions)
- Confirm `supi-settings` appears in `pi list` with its extension
- Manually verify `/supi-settings` is registered exactly once (no `:N` suffixes) by checking PI's command list

## Verification
- All CI commands pass with zero errors
- `/supi-settings` appears exactly once in PI's command list
