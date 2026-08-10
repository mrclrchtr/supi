# Review the current filesystem state

> **Status: Superseded.** ADR 0014 defines the current Review Target and Review Mode contract. ADR 0015 defines the one Review path. This ADR records old Working-Tree Review behavior only.

A Working-Tree Review resolves the canonical Git worktree root and compares a resolved baseline with files currently present anywhere in that worktree, including non-ignored untracked files, regardless of staging state or Pi's launch subdirectory.

Without `baseCommit`, the baseline is captured `HEAD`. With `baseCommit`, the Review Engine resolves and pins that commit, computes its merge base with captured `HEAD`, and uses the merge base as the before side. This lets one target represent committed branch changes plus staged, unstaged, and untracked work as a single net current-filesystem review.

The caller's Git index is not an evidence layer: the Review Engine uses a temporary index seeded from captured `HEAD` and augments it with paths tracked only by the baseline. This union index lets branch-level deletions and renames compare directly with the current filesystem while ensuring staging state and index flags cannot change the result. If a staged change is reversed in the working file, the staged commit candidate is outside the target. The aggregate patch is hashed incrementally and is not retained as a persistent artifact.

ADR 0007 supersedes the original unchecked repository-stability consequence: execution now re-creates and verifies the canonical patch before freezing it in a Review Workspace, and no longer depends on caller worktree stability after materialization.
