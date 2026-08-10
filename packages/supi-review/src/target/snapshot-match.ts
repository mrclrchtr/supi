import type { ReviewSnapshot } from "../types.ts";

/** Compare two resolved exact Review Targets for interactive drift detection. */
export function targetsMatch(
  left: ReviewSnapshot["target"],
  right: ReviewSnapshot["target"],
): boolean {
  return (
    left.fromCommit === right.fromCommit &&
    left.toCommit === right.toCommit &&
    left.includeUncommittedChanges === right.includeUncommittedChanges
  );
}

/** Compare two Review Snapshots by patch identity and target identity. */
export function snapshotsMatch(left: ReviewSnapshot, right: ReviewSnapshot): boolean {
  return left.diffHash === right.diffHash && targetsMatch(left.target, right.target);
}
