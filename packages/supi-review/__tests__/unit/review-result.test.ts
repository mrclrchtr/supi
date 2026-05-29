import { describe, expect, it } from "vitest";
import { normalizeReviewOutput } from "../../src/review-result.ts";
import type { ReviewItem } from "../../src/types.ts";

function buildReviewItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    title: "Missing guard",
    body: "Null token path is not checked.",
    category: "correctness",
    impact: "high",
    effort: "low",
    recommended_action: "must-fix",
    confidence_score: 0.9,
    suggested_fix: "Add an early null guard before using the token.",
    verification_hint: "Run the auth-path tests and confirm null token input fails cleanly.",
    code_location: {
      absolute_file_path: "/project/src/auth.ts",
      line_range: { start: 4, end: 5 },
    },
    ...overrides,
  };
}

describe("normalizeReviewOutput", () => {
  it("derives PATCH HAS ISSUES when any item is must-fix", () => {
    const normalized = normalizeReviewOutput({
      items: [buildReviewItem()],
      overall_explanation: "One review item remains.",
      overall_confidence_score: 0.82,
    });

    expect(normalized.overall_correctness).toBe("PATCH HAS ISSUES");
  });

  it("derives PATCH IS CORRECT when items are should-fix/consider only", () => {
    const normalized = normalizeReviewOutput({
      items: [
        buildReviewItem({
          title: "Docs polish",
          recommended_action: "should-fix",
          impact: "medium",
        }),
        buildReviewItem({ title: "Cleanup", recommended_action: "consider", impact: "low" }),
      ],
      overall_explanation: "No must-fix items.",
      overall_confidence_score: 0.74,
    });

    expect(normalized.overall_correctness).toBe("PATCH IS CORRECT");
  });

  it("sorts items by action, impact, effort, and confidence", () => {
    const normalized = normalizeReviewOutput({
      items: [
        buildReviewItem({
          title: "Consider cleanup",
          recommended_action: "consider",
          impact: "high",
          effort: "low",
          confidence_score: 0.7,
        }),
        buildReviewItem({
          title: "Must-fix medium effort",
          recommended_action: "must-fix",
          impact: "high",
          effort: "medium",
          confidence_score: 0.8,
        }),
        buildReviewItem({
          title: "Must-fix low effort",
          recommended_action: "must-fix",
          impact: "high",
          effort: "low",
          confidence_score: 0.6,
        }),
        buildReviewItem({
          title: "Should-fix high confidence",
          recommended_action: "should-fix",
          impact: "medium",
          effort: "low",
          confidence_score: 0.95,
        }),
      ],
      overall_explanation: "Sorting check.",
      overall_confidence_score: 0.91,
    });

    expect(normalized.items.map((item: { title: string }) => item.title)).toEqual([
      "Must-fix low effort",
      "Must-fix medium effort",
      "Should-fix high confidence",
      "Consider cleanup",
    ]);
  });

  it("computes action and category summary counts from normalized items", () => {
    const normalized = normalizeReviewOutput({
      items: [
        buildReviewItem({ category: "correctness", recommended_action: "must-fix" }),
        buildReviewItem({
          title: "Docs polish",
          category: "docs",
          recommended_action: "should-fix",
        }),
        buildReviewItem({ title: "Cleanup", category: "cleanup", recommended_action: "consider" }),
      ],
      overall_explanation: "Summary check.",
      overall_confidence_score: 0.88,
    });

    expect(normalized.summary.actions).toEqual({
      mustFix: 1,
      shouldFix: 1,
      consider: 1,
    });
    expect(normalized.summary.categories).toEqual({
      correctness: 1,
      docs: 1,
      cleanup: 1,
    });
  });
});
