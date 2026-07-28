# Review the current filesystem state

A Working-Tree Review resolves the canonical Git worktree root and compares a resolved baseline with files currently present anywhere in that worktree, including non-ignored untracked files, regardless of staging state or Pi's launch subdirectory.

Without `baseCommit`, the baseline is captured `HEAD`. With `baseCommit`, the Review Engine resolves and pins that commit, computes its merge base with captured `HEAD`, and uses the merge base as the before side. This lets one target represent committed branch changes plus staged, unstaged, and untracked work as a single net current-filesystem review.

The caller's Git index is not an evidence layer: the Review Engine uses a temporary index seeded from captured `HEAD` and augments it with paths tracked only by the baseline. This union index lets branch-level deletions and renames compare directly with the current filesystem while ensuring staging state and index flags cannot change the result. If a staged change is reversed in the working file, the staged commit candidate is outside the target. Repository stability from preparation or Direct Review invocation through reviewer completion—including a released-plan retry—is a caller precondition; the Review Engine does not fingerprint or detect drift. The aggregate patch is hashed incrementally and omitted from stored Review Plans.
