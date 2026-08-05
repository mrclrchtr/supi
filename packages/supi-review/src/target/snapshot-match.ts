import type { ReviewSnapshot } from "../types.ts";

/** Compare two resolved Review Target identities for drift detection. */
export function targetsMatch(
  left: ReviewSnapshot["target"],
  right: ReviewSnapshot["target"],
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "working-tree" && right.kind === "working-tree") {
    return (
      left.headCommit === right.headCommit &&
      left.requestedBaseCommit === right.requestedBaseCommit &&
      left.mergeBaseCommit === right.mergeBaseCommit
    );
  }
  if (left.kind === "comparison" && right.kind === "comparison") {
    return (
      left.requestedBaseCommit === right.requestedBaseCommit &&
      left.mergeBaseCommit === right.mergeBaseCommit &&
      left.headCommit === right.headCommit
    );
  }
  if (left.kind === "current-state" && right.kind === "current-state") {
    return left.headCommit === right.headCommit;
  }
  return (
    left.kind === "commit" &&
    right.kind === "commit" &&
    left.commit === right.commit &&
    left.parentCommit === right.parentCommit
  );
}

/** Compare two Review Snapshots by patch identity and target identity. */
export function snapshotsMatch(left: ReviewSnapshot, right: ReviewSnapshot): boolean {
  return left.diffHash === right.diffHash && targetsMatch(left.target, right.target);
}
