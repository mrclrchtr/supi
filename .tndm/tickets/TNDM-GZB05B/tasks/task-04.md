# Task 4: Migrate packages using terminal + context + debug domains (supi-ask-user, supi-context, supi-debug, supi-extras)

Update import sites in 4 packages that primarily use terminal, context, or debug symbols.

### supi-ask-user (1 file)
- `src/ask-user.ts`: `{ formatTitle, signalWaiting }` → from `"@mrclrchtr/supi-core/terminal"`

### supi-context (1 file)
- `src/analysis.ts`: `{ getRegisteredContextProviders }` → from `"@mrclrchtr/supi-core/context"`

### supi-debug (2 files)
- `src/debug.ts`: multi-line import with many debug types and functions — all from `"@mrclrchtr/supi-core/debug"`
- `src/renderer.ts`: `type { DebugEventView }` → from `"@mrclrchtr/supi-core/debug"`

### supi-extras (2 files)
- `src/tab-spinner.ts`: `{ formatTitle, signalDone }` → from `"@mrclrchtr/supi-core/terminal"`
- `src/prompt-stash.ts`: `{ readJsonFile }` → from `"@mrclrchtr/supi-core/config"`

### Verification
- `tsc -b` must pass for all 4 packages
- `pnpm test --filter @mrclrchtr/supi-ask-user --filter @mrclrchtr/supi-context --filter @mrclrchtr/supi-debug --filter @mrclrchtr/supi-extras` — all tests must pass
