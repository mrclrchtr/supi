// supi-agent-runtime workspace domain: Agent Workspace mechanics without caller policy.
// Callers decide which state to freeze, when to lease, and when to clean up.

export { runDependencyBootstrap } from "./workspace/bootstrap.ts";
export type {
  AgentWorkspaceReceipt,
  AgentWorkspaceReleaseFailure,
  AgentWorkspaceState,
  CreateDisposableWorkspaceOptions,
  DisposableAgentWorkspace,
} from "./workspace/disposable.ts";
export { createDisposableWorkspace } from "./workspace/disposable.ts";
export type { AgentWorkspaceEntry, AgentWorkspaceRemoval } from "./workspace/inventory.ts";
export { listAgentWorkspaces, removeAgentWorkspace } from "./workspace/inventory.ts";
export type { AcquireWorktreeLeaseOptions, WorktreeLease } from "./workspace/lease.ts";
export { acquireWorktreeLease } from "./workspace/lease.ts";
export type {
  AgentWorkspaceErrorCode,
  AgentWorkspaceOwner,
  AgentWorkspaceOwnerStatus,
} from "./workspace/types.ts";
export { AgentWorkspaceError } from "./workspace/types.ts";
export type { WorktreeDescription } from "./workspace/worktrees.ts";
export { describeWorktree, resolveWorktreeRoot } from "./workspace/worktrees.ts";
