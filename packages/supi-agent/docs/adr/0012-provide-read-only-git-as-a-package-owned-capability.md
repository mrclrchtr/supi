---
status: accepted
---

# Provide read-only Git as a package-owned capability

Read-only profiles need diffs and history; for reviews the diff is the primary evidence. `supi-agent` therefore owns a `git` capability: one Git query per call, passed as an argument list without a shell, limited to read subcommands (`diff`, `log`, `show`, `blame`, `status`, `rev-parse`, `ls-files`). It rejects options that write files or re-enable configured diff programs, and always disables the pager, optional locks, fsmonitor, external diff drivers, and textconv filters. Because its effects are classified by construction, it counts as read-only for batch admission, and `explore` keeps parallel and background runs.

## Considered Options

- **Give `explore` unrestricted `bash`:** rejected. `bash` stays mutation-capable ([ADR 0001](0001-limit-parallel-delegation-to-read-only-profiles.md)), so `explore` would lose parallel and background runs. Explorers run in the user's working tree, not a disposable Review Workspace, and the stash is shared across worktrees.
- **Give `explore` `bash` when it runs in its own workspace:** rejected after [ADR 0013](0013-admit-parallel-writers-under-worktree-claims.md) and [ADR 0014](0014-create-kept-agent-workspaces-for-writers.md) ([#682](https://github.com/mrclrchtr/supi/issues/682)). `general` with `new.cwd` or `new.worktree` already runs a shell in parallel and in the background, so a shell explorer would add only a prompt-level write restriction. Its workspace would still start from a commit without the parent's uncommitted changes, and its `bash` would still share the stash, refs, and Git config with the parent. A disposable Review-style snapshot of the parent's state would need the canonical diff compiler ([#695](https://github.com/mrclrchtr/supi/issues/695)) and a bootstrap per run; reconsider it when there is concrete demand.
- **Classify `bash` as read-only for inspection profiles:** rejected. Read-only would become a prompt protocol instead of a capability property.
- **Typed fields per Git operation:** rejected. An argument list keeps Git's familiar vocabulary; the subcommand allowlist and option checks carry the safety policy.
- **Share the tool with `supi-review`:** deferred. Reviewers already have `bash` in a disposable worktree, and `supi-review`'s internal Git helpers serve a different purpose. Move the tool to a shared package when a second consumer needs model-facing Git without a shell.

## Consequences

- The allowlist limits what the model chooses. Repository configuration such as aliases and hooks is trusted like the user's own Git.
- Arguments after `--` are paths and are not checked as options.
- New read subcommands or options require auditing their write and execution paths before admission.
- Tasks that need a shell, for example to run tests or probes, use `general` in its own linked worktree under the writer rules of ADR 0013.
