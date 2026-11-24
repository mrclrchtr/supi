---
status: accepted
---

# Create kept Agent Workspaces for writers

`agent_run` can create an Agent Workspace per Mutation-Capable Delegation Task (`new: { profile, worktree: { base?, branch? } }`), so callers no longer prepare worktrees themselves before running writers in parallel ([#681](https://github.com/mrclrchtr/supi/issues/681)). The runtime creates the worktree ([runtime ADR 0001](../../../supi-agent-runtime/docs/adr/0001-own-session-mechanics-not-resource-policy.md)); Agent decides its base, branch, path, bootstrap, and lifetime:

- **Base:** a commit-ish resolved to a commit in the parent's working directory, by default `HEAD`. Uncommitted changes are not copied; the result says when there were any. Copying them needs the canonical diff compiler that Review owns ([#695](https://github.com/mrclrchtr/supi/issues/695)).
- **Branch:** always a new branch, never a detached HEAD, so the writer's commits stay reachable and can be fast-forwarded. The default `supi/<task id>-<6 hex>` is unique across runs. An existing branch is rejected, never reset.
- **Path:** a sibling of the main worktree, `<main worktree>.<branch>`, like Worktrunk's default. Temporary directories are purged by the operating system, and a directory inside the repository is scanned by search, lint, and language-server tools.
- **Lease:** `git worktree add --lock` writes the `delegation` lease at creation, so no other process sees the worktree unlocked. The writer then follows [ADR 0013](0013-admit-parallel-writers-under-worktree-claims.md) like a writer with `new.cwd`.
- **Bootstrap:** `agent.bootstrapCommand` runs once in each created worktree before the batch starts, like `review.bootstrapCommand`. Git runs `post-checkout` hooks during creation.
- **Lifetime:** a rejection before any task starts, including a failed bootstrap, removes every created worktree and its unmoved branch. Once a task can start, the worktree and branch are kept whatever the outcome; the result names them, and follow-ups reuse the path. `/supi-agent-cleanup` only unlocks them, because their marker is not disposable.

Only mutation-capable profiles can request a worktree, and not together with `new.cwd`.

## Considered Options

- **Detached HEAD (Codex app):** rejected. Commits on a detached HEAD are lost when the worktree is removed, and the parent cannot fast-forward a branch.
- **Base on the remote default branch (Claude Code `fresh`):** rejected as default. It needs network access, and trunk-based work branches from the local state.
- **Remove worktrees without changes after the run (Claude Code):** rejected. Follow-ups need the path, and the parent decides when a result is merged.
- **Create and bootstrap inside each task's run:** rejected. Preflight loads instruction files from the task's working directory, so the worktree must exist before preflight; a failed creation then rejects the whole batch, like other admission failures.

## Consequences

- Creation runs during admission, so the starting call waits for checkout, hooks, and the bootstrap, also for background batches.
- `git worktree add` with a commit and `--no-track` writes no Git config, which avoids the `config.lock` contention seen with parallel worktree creation ([claude-code#34645](https://github.com/anthropics/claude-code/issues/34645)). Creations of one repository also run one after another within the process.
- Created worktrees accumulate next to the main worktree until the user removes them.
