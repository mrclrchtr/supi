# Task 3: Update pi.image in 15 package.json files to point to logo PNG

Set or replace `pi.image` in each package.json to point to the logo PNG on GitHub.

**Files modified (15 package.json files — all with a `pi` field):**

Packages that already have `pi.image` — replace the URL:
- `packages/supi-ask-user/package.json`
- `packages/supi-cache/package.json`
- `packages/supi-code-intelligence/package.json`
- `packages/supi-context/package.json`
- `packages/supi-debug/package.json`
- `packages/supi-extras/package.json`
- `packages/supi-insights/package.json`
- `packages/supi-lsp/package.json`
- `packages/supi-review/package.json`
- `packages/supi-tree-sitter/package.json`
- `packages/supi-web/package.json`

Packages that have `pi.extensions` but no `pi.image` — add the field:
- `packages/supi-bash-timeout/package.json`
- `packages/supi-claude-md/package.json`
- `packages/supi-rtk/package.json`
- `packages/supi-settings/package.json`

**New value for all:**
```json
"image": "https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/<pkg-dir>/assets/logo.png"
```

**Skipped:**
- `packages/supi-core/package.json` — no `pi` field (library-only, not in gallery)
- `packages/supi-test-utils/package.json` — no `pi` field (test utility, not in gallery)

**Verification (test-exempt — JSON field change):**
- Run `node -e "console.log(require('./packages/<pkg>/package.json').pi.image)"` for 3 spot-checked packages
- Confirm URLs follow pattern: `https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/<pkg>/assets/logo.png`
- Run `pnpm verify` — must pass (manifest integrity)
