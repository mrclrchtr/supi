---
status: accepted
---

# Own session mechanics, not resource policy

The runtime receives Agent Session Inputs containing caller-built resources, then owns AgentSessionRuntime creation, extension binding, prompting, cancellation and timeout races, shutdown grace, usage collection, and disposal. Callers retain cwd/model/tool/resource policy, which keeps generic profile loading outside the runtime while centralizing the proven lifecycle mechanics both adapters would otherwise duplicate.

## Amendment: Agent Workspace mechanics

Amended by [#672](https://github.com/mrclrchtr/supi/issues/672). The runtime also owns the neutral Agent Workspace mechanics: canonical worktree roots, creating, freezing, and verifying disposable linked worktrees, leases, inventory, cleanup with the shared `/supi-agent-cleanup` command, and the one-shot Dependency Bootstrap. Callers own workspace policy: which state to freeze, which worktree to lease and when, and when to remove a workspace. Review keeps target resolution, its canonical diff compiler, and its Review Workspace lifetime. Agent keeps Worktree Claims and admission ([Agent ADR 0013](../../../supi-agent/docs/adr/0013-admit-parallel-writers-under-worktree-claims.md)). The mechanics know no Review Targets, Agent Profiles, or Delegation policy.

Review isolation was previously kept outside the runtime. Two owners now need the same lease and cleanup mechanics, and one recovery command must see the worktrees of both. A lease is behavioral and not a sandbox ([ADR 0007](0007-treat-agent-isolation-as-context-only.md)).
