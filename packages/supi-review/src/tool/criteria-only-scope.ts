import type { ReviewBatchDetails, ReviewInput, ReviewSnapshot } from "../types.ts";

/** Current-State Audit criteria-only rejection reason shared by direct and prepared paths. */
export const CRITERIA_ONLY_SCOPE_REASON =
  "Current-State Audit fixes criteria-only finding scope; remove task findingScope fields.";

/**
 * Enforce fixed criteria-only scope for Current-State Audit.
 * Caller-supplied scope is rejected; planner-default scope on accepted drafts is stripped.
 */
export function enforceCriteriaOnlyScope(
  review: ReviewInput,
  targetKind: ReviewSnapshot["target"]["kind"],
  provenance: ReviewBatchDetails["provenance"],
): { review: ReviewInput } | { reason: string } {
  if (targetKind !== "current-state") return { review };
  const hasExplicitScope = review.tasks.some((task) => task.findingScope !== undefined);
  if (!hasExplicitScope) return { review };
  if (provenance === "planner-assisted") {
    return {
      review: {
        ...review,
        tasks: review.tasks.map((task) => {
          const { findingScope: _stripped, ...rest } = task;
          return rest;
        }),
      },
    };
  }
  return { reason: CRITERIA_ONLY_SCOPE_REASON };
}
