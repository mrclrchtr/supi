# Task 2: Update meta-package staging to include external runtime deps required by bundled workspace packages

## Goal
Fix the meta-package tarball contents by teaching the staging pipeline about external runtime dependencies from bundled workspace packages.

## File
- `scripts/pack-staged.mjs`

## Change
- Add a helper that inspects the bundled workspace package manifests involved in `@mrclrchtr/supi` assembly and collects third-party runtime dependencies.
- Merge those dependencies into the staged meta-package root manifest before `npm pack`.
- Preserve current behavior for bundled `@mrclrchtr/*` workspace packages and existing manifest rewriting.
- If multiple bundled packages require the same external dependency, use one consistent resolved spec and avoid duplicate logic.

## Constraints
- Do not manually hardcode package-specific dependency names if a general manifest-driven solution is straightforward.
- Do not change the public package surface or bundle unrelated dependencies.

## Verification
Re-run the focused regression test and confirm it now passes.
