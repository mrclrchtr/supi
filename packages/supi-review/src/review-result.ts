import type {
  NormalizedReviewOutput,
  RawReviewResult,
  ReviewItem,
  ReviewItemCategory,
  ReviewItemEffort,
  ReviewItemImpact,
  ReviewItemRecommendedAction,
  ReviewOutputEvent,
  ReviewResult,
  ReviewSummary,
} from "./types.ts";

const actionRank: Record<ReviewItemRecommendedAction, number> = {
  "must-fix": 0,
  "should-fix": 1,
  consider: 2,
};

const impactRank: Record<ReviewItemImpact, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const effortRank: Record<ReviewItemEffort, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/** Normalize raw reviewer output into the host-owned review contract. */
export function normalizeReviewOutput(output: ReviewOutputEvent): NormalizedReviewOutput {
  const items = [...(Array.isArray(output.items) ? output.items : [])].sort(compareReviewItems);
  const summary = summarizeReviewItems(items);

  return {
    ...output,
    items,
    overall_correctness: summary.actions.mustFix > 0 ? "PATCH HAS ISSUES" : "PATCH IS CORRECT",
    summary,
  };
}

/** Normalize a raw reviewer result for rendering and follow-up handling. */
export function normalizeReviewResult(result: RawReviewResult): ReviewResult {
  if (result.kind !== "success") {
    return result;
  }

  return {
    ...result,
    output: normalizeReviewOutput(result.output),
  };
}

function compareReviewItems(left: ReviewItem, right: ReviewItem): number {
  const actionDiff = actionRank[left.recommended_action] - actionRank[right.recommended_action];
  if (actionDiff !== 0) return actionDiff;

  const impactDiff = impactRank[left.impact] - impactRank[right.impact];
  if (impactDiff !== 0) return impactDiff;

  const effortDiff = effortRank[left.effort] - effortRank[right.effort];
  if (effortDiff !== 0) return effortDiff;

  return right.confidence_score - left.confidence_score;
}

function summarizeReviewItems(items: ReviewItem[]): ReviewSummary {
  const categories: Partial<Record<ReviewItemCategory, number>> = {};
  const summary: ReviewSummary = {
    actions: {
      mustFix: 0,
      shouldFix: 0,
      consider: 0,
    },
    categories,
  };

  for (const item of items) {
    switch (item.recommended_action) {
      case "must-fix":
        summary.actions.mustFix++;
        break;
      case "should-fix":
        summary.actions.shouldFix++;
        break;
      case "consider":
        summary.actions.consider++;
        break;
    }

    categories[item.category] = (categories[item.category] ?? 0) + 1;
  }

  return summary;
}
