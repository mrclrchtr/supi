# Add per-package logo variants

## Problem

`assets/supi-logo.svg` exists but isn't used anywhere. No package README includes the logo, and only 4 of 17 packages have `pi.image` for the PI gallery. The logo should be re-used across all packages with per-package subtitles.

## Approach

**Script-based generation + per-package PNG.** One generation script produces per-package PNG logos from a template SVG, then READMEs and package.json files are updated to reference them.

## Components

### 1. `scripts/generate-logos.mjs` — generation script

- Reads `assets/supi-logo.svg` as a template string
- For each package, substitutes the subtitle `<text>` element and pipes through ImageMagick (`magick SVG:- PNG:-`)
- Writes to `packages/<pkg>/assets/logo.png`
- Defines a subtitle mapping:

| Package | Subtitle |
|---|---|
| supi-ask-user | Ask User |
| supi-bash-timeout | Bash Timeout |
| supi-cache | Cache |
| supi-claude-md | Claude.md |
| supi-code-intelligence | Code Intelligence |
| supi-context | Context |
| supi-core | Core |
| supi-debug | Debug |
| supi-extras | Extras |
| supi-insights | Insights |
| supi-lsp | LSP |
| supi-review | Review |
| supi-rtk | RTK |
| supi-settings | Settings |
| supi-test-utils | Test Utils |
| supi-tree-sitter | Tree-sitter |
| supi-web | Web |

### 2. README updates

Each `packages/*/README.md` gets `![SuPi](assets/logo.png)` added above the `# @mrclrchtr/supi-*` heading. Exception: supi-settings has no README — skip.

### 3. `pi.image` in package.json

Each package.json gets:
```json
"pi": { "image": "https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-<name>/assets/logo.png" }
```

The 4 packages with existing screenshot-based `pi.image` (supi-cache, supi-code-intelligence, supi-lsp, supi-web) get replaced.

### 4. Generated PNGs committed

PNGs are committed to the repo. The script is for regeneration when the logo template changes, not a CI build step.

## Edge cases

- **supi-settings**: no README — generate logo only (for gallery), skip README update
- **supi-test-utils**: included for consistency, though not user-facing
- **`supi/`** (empty placeholder): skipped entirely
- **ImageMagick font rendering**: SVG uses SFMono-Regular/ui-monospace — may degrade slightly for the 14px subtitle, which is acceptable

## Non-goals

- Changing the main "SuPi" title text
- Adding logo to root README (already has ASCII art)
- Multiple resolutions or responsive sizing

## Verification

- Run `node scripts/generate-logos.mjs`, verify all 17 PNGs exist and look correct
- Spot-check 3 package READMEs render on GitHub
- `pnpm verify` passes
