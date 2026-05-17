## Scope

Single coherent change: replace "opinionated" with personal + curated framing across 5 files. Text-only, no code changes.

## Files

| File | What changes |
|------|-------------|
| `README.md` (root) | Hero section: tagline, lead paragraph |
| `package.json` (root) | `description` field |
| `packages/supi/README.md` | First paragraph |
| `packages/supi/package.json` | `description` field |
| `CLAUDE.md` (root) | First line |

Incidental "opinionated" uses in `packages/supi-claude-md/skills/*/references/templates.md` are intentionally left alone — they're internal reference material, not marketing.

## Tasks

- [x] **Task 1**: Rewrite root `README.md` hero section
  - File: `README.md`
  - Change: Replace tagline and lead paragraph from "opinionated" framing to personal + curated framing.
  - Old:
    ```
    *The opinionated way to extend PI.*
    SuPi is an opinionated extension monorepo for PI with LSP, Skills, marketplace compatibility, and personal best practices built in.
    ```
  - New:
    ```
    *My curated extension stack for PI — shared in case they help you too.*
    SuPi is my personal collection of extensions for PI: LSP, code intelligence, structural analysis, and practical utilities. Built for my own workflow and shared freely.
    ```
  - Verification: Read the file, confirm both old strings are gone and new strings are present. Run `pnpm exec biome check README.md` (no formatting errors).

- [x] **Task 2**: Update root `package.json` description
  - File: `package.json`
  - Change: Replace description string.
  - Old: `"SuPi (Super Pi) — The opinionated way to extend PI. Workspace root."`
  - New: `"SuPi (Super Pi) — A curated extension stack for PI. Workspace root."`
  - Verification: `jq '.description' package.json` outputs the new string.

- [x] **Task 3**: Rewrite `packages/supi/README.md` opener
  - File: `packages/supi/README.md`
  - Change: Replace first paragraph.
  - Old: `SuPi (**Super Pi**) is an opinionated bundle of production-ready extensions, skills, and supporting packages for the [pi coding agent](https://github.com/earendil-works/pi).`
  - New: `SuPi (**Super Pi**) is my curated extension stack for the [pi coding agent](https://github.com/earendil-works/pi) — a collection of extensions I use daily and am happy to share.`
  - Verification: Read the file, confirm old is gone and new is present. Run `pnpm exec biome check packages/supi/README.md`.

- [x] **Task 4**: Update `packages/supi/package.json` description
  - File: `packages/supi/package.json`
  - Change: Replace description string.
  - Old: `"SuPi (Super Pi) — The opinionated way to extend PI. Meta-package bundling the full SuPi extension stack."`
  - New: `"SuPi (Super Pi) — A curated extension stack for PI. Meta-package bundling the full SuPi collection."`
  - Verification: `jq '.description' packages/supi/package.json` outputs the new string.

- [x] **Task 5**: Update `CLAUDE.md` first line
  - File: `CLAUDE.md`
  - Change: Replace "an opinionated extension repo" with "a curated extension repo".
  - Old: `SuPi (**Super Pi**) is an opinionated extension repo for the [pi coding agent]...`
  - New: `SuPi (**Super Pi**) is a curated extension repo for the [pi coding agent]...`
  - Verification: `head -3 CLAUDE.md` shows the updated text.
