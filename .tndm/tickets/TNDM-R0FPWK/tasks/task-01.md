# Task 1: Add snapshot-specific git helpers for per-file diffs and before/after reads

## Goal
Teach `supi-review` how to resolve per-file snapshot data without relying on the bulk `diffText` string.

## Changes
- Extend `packages/supi-review/src/git.ts` with read-only helpers that, given a `ReviewSnapshot` plus file path, can return:
  - the file-specific diff for that changed file
  - the `before` file contents for the selected snapshot
  - the `after` file contents for the selected snapshot
- Keep the helpers constrained to the snapshot kinds already supported by `ReviewSnapshot`:
  - working tree
  - branch diff vs merge base
  - commit review
- Reuse the existing git timeout/scrub behavior so the new subprocess calls inherit the same safety defaults.
- Treat working-tree snapshots carefully:
  - `before` should come from the git baseline used for the change
  - `after` should come from the working copy
  - untracked files should behave sensibly (no `before` content)
- Branch and commit helpers must resolve contents from the compared revisions rather than the live working tree.

## Tests first
Add failing coverage in:
- `packages/supi-review/__tests__/unit/git.test.ts` for realistic repo behavior
- `packages/supi-review/__tests__/unit/git-timeout.test.ts` for timeout propagation on every new git command

Cover at least:
- per-file diff retrieval for a changed tracked file
- before/after reads for a modified tracked file
- sensible handling for added or deleted files
- behavior for the supported snapshot kinds

## Done when
The new helpers are covered by targeted unit tests and are ready for reviewer-facing tool wrappers.
