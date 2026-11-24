/** SuPi component that holds an Agent Workspace lock. */
export type AgentWorkspaceOwner = "review" | "delegation";

/** Advisory status of the process named in a SuPi lock marker. */
export type AgentWorkspaceOwnerStatus = "active" | "absent" | "unknown";

/** Why an Agent Workspace operation was refused. */
export type AgentWorkspaceErrorCode =
  /** The supplied patch does not hash to the expected SHA-256. */
  | "patch-mismatch"
  /** The created worktree did not check out exactly the base commit. */
  | "unexpected-head"
  /** The created worktree has changes although no patch was applied. */
  | "not-clean"
  /** The caller's patch reader returned bytes that do not hash to the expected SHA-256. */
  | "hash-mismatch"
  /** Git cannot lock the main worktree, so it cannot be leased. */
  | "main-worktree"
  /** The worktree is locked with a reason SuPi did not write. */
  | "locked-foreign"
  /** The worktree is locked by a SuPi owner whose process is alive or cannot be checked. */
  | "locked-active"
  /** The worktree is locked by a SuPi owner whose process has exited. */
  | "locked-orphaned"
  /** A branch name for a new worktree is not a valid Git branch name. */
  | "invalid-branch"
  /** The branch for a new worktree already exists. */
  | "branch-exists"
  /** The path for a new worktree already exists. */
  | "path-exists";

/** A refused Agent Workspace operation; `heldBy` carries the existing lock reason. */
export class AgentWorkspaceError extends Error {
  readonly code: AgentWorkspaceErrorCode;
  readonly heldBy?: string;

  constructor(code: AgentWorkspaceErrorCode, message: string, heldBy?: string) {
    super(message);
    this.name = "AgentWorkspaceError";
    this.code = code;
    if (heldBy !== undefined) this.heldBy = heldBy;
  }
}
