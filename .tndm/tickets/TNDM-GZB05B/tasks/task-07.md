# Task 7: Migrate supi-rtk and remaining stragglers (supi-core internal test + any missed imports)

Update the remaining import sites that weren't covered by tasks 3–6.

### supi-rtk (2 files)
- `src/rtk.ts`: `{ registerConfigSettings, registerContextProvider, ... }` (multi-line) → split: `registerConfigSettings` from `"@mrclrchtr/supi-core/config"`, `registerContextProvider` from `"@mrclrchtr/supi-core/context"`
- `__tests__/unit/extension.test.ts`: `{ registerConfigSettings, registerContextProvider }` → split same way

### supi-core internal test (1 file)
- `__tests__/unit/substrate-types.test.ts`: `type { CodeLocation, CodePosition }` → from `"@mrclrchtr/supi-core/types"`

### Audit for remaining `api` imports
Run `grep -rn 'from "@mrclrchtr/supi-core/api"' --include='*.ts' packages/ | grep -v node_modules | grep -v '/dist/'` to confirm zero remaining non-barrel internal uses of `./api` (the barrel itself and api.ts are excluded).

### Verification
- `tsc -b` must pass for all remaining packages
- `pnpm test --filter @mrclrchtr/supi-rtk --filter @mrclrchtr/supi-core` — all tests must pass
- `grep` audit returns zero matches outside supi-core's own api.ts/index.ts
