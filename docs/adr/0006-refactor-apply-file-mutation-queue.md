# code_refactor_apply uses sorted multi-acquire withFileMutationQueue with cross-file rollback

`code_refactor_apply` wraps its whole precompute-then-commit in
`withFileMutationQueue`, acquiring the queue for every involved file in
**sorted path order** before building transformed contents and committing,
and keeps the existing cross-file rollback. No `executionMode: "sequential"`
is set — each apply is independent (different `planId`, different files).

Built-in `edit`/`write` serialize per file through `withFileMutationQueue`;
`code_refactor_apply` previously did its own atomic precompute-then-commit
with rollback but never entered the queue, so a sibling `edit` on the same
file in one parallel batch could race the refactor apply. Sorted multi-acquire
serializes against siblings **and** preserves all-or-nothing across files,
while sorted order prevents lock-ordering deadlock. Global `sequential` is
unnecessary because applies do not share order-dependent state — per-file
queueing is sufficient.

## Considered Options

- **Per-file queue, drop cross-file rollback** — rejected: a failure after
  file A committed leaves A changed while B releases; reintroduces partial
  commits across files (worse than today).
- **Global `executionMode: "sequential"` + per-file queue** — rejected:
  over-conservative; the checklist reserves `sequential` for order-dependent
  shared state, and applies are independent.

## Consequences

- The apply path must acquire queues for all target files (sorted) before
  reading; do not queue each file independently.
- Fingerprint re-validation and range re-checks happen inside the queued
  window, so a stale plan still fails cleanly without racing a sibling edit.
