# Task 1: Create scripts/generate-logos.mjs — SVG template substitution + ImageMagick PNG conversion

Create the generation script that produces per-package PNG logos.

**Files created:**
- `scripts/generate-logos.mjs`

**What it does:**
1. Reads `assets/supi-logo.svg` as a template string
2. Defines a subtitle mapping (package dir name → display subtitle) for 17 packages
3. For each package with a package.json:
   - Substitutes the subtitle `<text>` node in the SVG (`>Curated Extension Stack<` → `><subtitle><`)
   - Pipes the modified SVG through ImageMagick: `magick -background none -density 300 SVG:- -resize 512x512 PNG:<outpath>`
   - Creates `packages/<pkg>/assets/` directory if missing
4. Skips `supi/` (no package.json)
5. Reports which packages were generated

**Subtitle mapping:**

| Package dir | Subtitle |
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

**Verification (test-exempt — script output is visual):**
- Run `node scripts/generate-logos.mjs`
- Confirm all 17 PNG files exist under `packages/*/assets/logo.png`
- Confirm files are non-zero size
- Spot-check 3 PNGs visually with `open packages/supi-lsp/assets/logo.png` (or similar)

