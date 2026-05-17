# Archive

## Fresh verification (2026-05-17)

### Task 1 — README.md hero section
- `grep "opinionated" README.md` → 0 matches ✅
- `grep "My curated extension stack for PI — shared in case they help you too" README.md` → found ✅
- `grep "Built for my own workflow and shared freely" README.md` → found ✅

### Task 2 — root package.json description
- `jq '.description' package.json` → `"SuPi (Super Pi) — A curated extension stack for PI. Workspace root."` ✅

### Task 3 — packages/supi/README.md opener
- `grep "opinionated" packages/supi/README.md` → 0 matches ✅
- `grep "my curated extension stack" packages/supi/README.md` → found ✅
- `grep "happy to share" packages/supi/README.md` → found ✅

### Task 4 — packages/supi/package.json description
- `jq '.description' packages/supi/package.json` → `"SuPi (Super Pi) — A curated extension stack for PI. Meta-package bundling the full SuPi collection."` ✅

### Task 5 — CLAUDE.md first line
- `grep "opinionated" CLAUDE.md` → 0 matches ✅
- `grep "curated extension repo" CLAUDE.md` → found ✅

### Incidental non-change confirmed
- `packages/supi-claude-md/skills/*/references/templates.md` still contains its two incidental "opinionated" uses (internal reference material, not marketing) ✅

### Git diff summary
- 5 files changed, 6 insertions(+), 6 deletions(-)
- Only targeted edits, no unintended changes ✅
