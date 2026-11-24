---
status: superseded by ADR-0013
---

# Limit parallel delegation to read-only profiles

Superseded by [ADR 0013](0013-admit-parallel-writers-under-worktree-claims.md).

A multi-task Delegation Batch may run concurrently only when every selected Agent Profile is read-only. Read-only eligibility is derived from the package-owned tool classification; unrestricted `bash` is mutation-capable because shell effects cannot be reliably classified, even when a profile intends only inspection. Mutation-capable profiles require a single-task batch, and the outer `supi_agent_run` tool uses Pi's sequential execution mode so parent sibling tools cannot race a child implementer.
