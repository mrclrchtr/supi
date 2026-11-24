---
status: accepted
---

# Admit parallel writers under Worktree Claims

A Mutation-Capable Delegation Task takes a Worktree Claim on the canonical root of its working directory's worktree. For a linked worktree other than the parent's, the claim is a lease through the runtime Agent Workspace mechanics ([runtime ADR 0001](../../../supi-agent-runtime/docs/adr/0001-own-session-mechanics-not-resource-policy.md)), so it is exclusive across sessions and processes. A writer that holds a lease runs like a read-only task: in multi-task batches, and in the background by default in TUI and RPC. The main worktree cannot be locked by Git, and the parent's worktree belongs to the human, so writers there get only a session-local claim and keep the single-task foreground rule. Any conflict rejects the whole batch before a task starts. A conflict is a claim of the same batch or session, a foreign lock, or a live or orphaned SuPi lock. Without this, independent tickets run one after another while the parent waits.

This supersedes [ADR 0001](0001-limit-parallel-delegation-to-read-only-profiles.md). Its tool classification stays: read-only eligibility comes from the package-owned classification, and unrestricted `bash`, `edit`, and `write` stay mutation-capable.

## Considered Options

- **Keep writers single-task and foreground:** rejected. Parallel implementers in separate worktrees cannot share a checkout, which was the risk ADR 0001 guarded against.
- **Session-local claims only:** rejected. Two Pi sessions or processes could start writers in one worktree without seeing each other.
- **Take over orphaned locks automatically:** rejected. A writer cannot prove that the earlier owner's work is finished. The rejection names `/supi-agent-cleanup` instead.
- **Queue conflicting writers or start part of a batch:** rejected. Admission stays all-or-nothing, like capacity.

## Consequences

- A lease is behavioral, not a sandbox ([runtime ADR 0007](../../../supi-agent-runtime/docs/adr/0007-treat-agent-isolation-as-context-only.md)). `bash` can still leave its worktree.
- Worktrees of one repository still share Git refs, the stash, Git config and hooks, ports, temporary directories, global config, and the package store. These are documented, not mitigated.
- Claims are reserved with the capacity reservation and each task's claim and lease is released once that task's own run has disposed its resources, on every terminal path, while sibling runs of its batch may keep running. A start whose only conflicts are claims of tasks that have already returned their result waits up to 60 seconds for their release instead of rejecting at once. A caller-provided worktree is unlocked but never removed.
- A Delegation Follow-Up claims its saved working directory, or the parent's when none was saved, under the same rules.
- Worktrunk worktrees and colocated jj workspaces are plain Git linked worktrees and are recognized without configuration. GitButler lanes share one checkout, and non-colocated jj workspaces are not Git worktrees, so neither gives a writer a lease.
