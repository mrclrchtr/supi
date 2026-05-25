# Task 2: Add logo image to all 16 package README headers

Add the logo image to each package README header.

**Files modified (16 READMEs):**
- `packages/supi-ask-user/README.md`
- `packages/supi-bash-timeout/README.md`
- `packages/supi-cache/README.md`
- `packages/supi-claude-md/README.md`
- `packages/supi-code-intelligence/README.md`
- `packages/supi-context/README.md`
- `packages/supi-core/README.md`
- `packages/supi-debug/README.md`
- `packages/supi-extras/README.md`
- `packages/supi-insights/README.md`
- `packages/supi-lsp/README.md`
- `packages/supi-review/README.md`
- `packages/supi-rtk/README.md`
- `packages/supi-test-utils/README.md`
- `packages/supi-tree-sitter/README.md`
- `packages/supi-web/README.md`

**What to do:**
Prepend `![SuPi](assets/logo.png)\n\n` before the `# @mrclrchtr/supi-*` heading (first line) in each README.

**Skipped:**
- `packages/supi-settings/README.md` — doesn't exist

**Verification (test-exempt — markup-only change):**
- Spot-check 3 READMEs: confirm the `![SuPi](assets/logo.png)` line appears before the `#` heading
- The heading itself must remain unchanged
