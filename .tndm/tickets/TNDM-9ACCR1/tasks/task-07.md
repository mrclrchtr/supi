# Task 7: Update documentation

## Goal
Update all docs that reference `supi-core` as an extension or its `./extension` export.

## Files to modify
- `packages/supi-core/CLAUDE.md`:
  - Remove/update references to `src/extension.ts`, `./extension` export, `/supi-settings` registration
  - Update source layout section
  - Keep all library surface documentation intact
- `packages/supi-core/README.md`:
  - Remove `@mrclrchtr/supi-core/extension` from entry points list
- Root `CLAUDE.md`:
  - Update `supi-core entry points` section to reflect library-only surface
  - Update `Self-registering resources` section if it references `supi-core` extension
  - Update `Packaging conventions` section about bundled extension references — note that `supi-core` is now library-only

## Verification
- Read each modified doc file, confirm no stale extension references remain
- `supi-core/README.md` no longer lists `./extension`
- Root `CLAUDE.md` entry points section is accurate
