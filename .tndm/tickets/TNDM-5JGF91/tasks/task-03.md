# Task 3: Update CLAUDE.md: document new pack:verify command

## Goal

Update `CLAUDE.md` to reflect the new `pack:verify` implementation.

## Changes

In the **Publish pipeline** section, update the command description:

```markdown
- `pack:check` and `pack:verify` commands in `pnpm verify` run this pipeline for all publishable packages.
```

to:

```markdown
- `pack:check` runs this pipeline as a dry-run for all publishable packages. `pack:verify` runs the full pack + tarball verification for all 16 packages via a parallel Node.js runner (`scripts/pack-all.mjs`).
```

## Verification

```bash
grep -A2 "pack:check" CLAUDE.md
# Should show the new description
```
