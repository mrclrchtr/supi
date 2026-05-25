# Task 3: Migrate packages using config + settings domains (supi-bash-timeout, supi-cache, supi-claude-md, supi-insights)

Update import sites in 4 packages that primarily use config + settings symbols.

### supi-bash-timeout (4 files)
- `src/config.ts`: `{ loadSupiConfig }` → `from "@mrclrchtr/supi-core/config"`
- `src/settings-registration.ts`: `{ createInputSubmenu, registerConfigSettings }` → split: `registerConfigSettings` from `"@mrclrchtr/supi-core/config"`, `createInputSubmenu` from `"@mrclrchtr/supi-core/settings-ui"`
- `__tests__/unit/extension.test.ts`: `{ clearRegisteredSettings, getRegisteredSettings }` → `from "@mrclrchtr/supi-core/settings"`
- `__tests__/unit/settings-registration.test.ts`: `{ clearRegisteredSettings, getRegisteredSettings }` → `from "@mrclrchtr/supi-core/settings"`

### supi-cache (3 files)
- `src/config.ts`: `{ loadSupiConfig }` → `from "@mrclrchtr/supi-core/config"`
- `src/settings-registration.ts`: `{ registerConfigSettings }` and `type { ConfigSettingsHelpers }` → both from `"@mrclrchtr/supi-core/config"`
- `src/forensics/forensics.ts`: `{ getActiveBranchEntries }` → `from "@mrclrchtr/supi-core/session"`
- `__tests__/unit/config.test.ts`: `{ clearRegisteredSettings, getRegisteredSettings }` → `from "@mrclrchtr/supi-core/settings"`

### supi-claude-md (4 files)
- `src/config.ts`: `{ loadSupiConfig }` → `from "@mrclrchtr/supi-core/config"`
- `src/settings-registration.ts`: multi-line import with `createInputSubmenu, type ConfigSettingsHelpers, registerConfigSettings` — split: `registerConfigSettings, type ConfigSettingsHelpers` from `"@mrclrchtr/supi-core/config"`, `createInputSubmenu` from `"@mrclrchtr/supi-core/settings-ui"`
- `src/subdirectory.ts`: `{ wrapExtensionContext }` → `from "@mrclrchtr/supi-core/context"`
- `__tests__/unit/settings-registration.test.ts`: `{ clearRegisteredSettings, getRegisteredSettings }` → `from "@mrclrchtr/supi-core/settings"`

### supi-insights (2 files)
- `src/insights.ts`: `{ loadSupiConfig, registerConfigSettings }` → both from `"@mrclrchtr/supi-core/config"`
- `src/parser.ts`: `{ getActiveBranchEntries }` → `from "@mrclrchtr/supi-core/session"`

### Verification
- `tsc -b` must pass for all 4 packages
- `pnpm test --filter @mrclrchtr/supi-bash-timeout --filter @mrclrchtr/supi-cache --filter @mrclrchtr/supi-claude-md --filter @mrclrchtr/supi-insights` — all tests must pass
