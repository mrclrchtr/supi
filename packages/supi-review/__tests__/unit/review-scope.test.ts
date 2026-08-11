import { describe, expect, it } from "vitest";
import { REVIEW_LIMITS } from "../../src/review-limits.ts";
import { normalizeReviewScope } from "../../src/review-scope.ts";

describe("normalizeReviewScope", () => {
  it("normalizes aliases and removes duplicates", () => {
    expect(normalizeReviewScope({ paths: [" ./src/a.ts ", "src/a.ts", "@docs", "docs/"] })).toEqual(
      { paths: ["src/a.ts", "docs"] },
    );
  });

  it("rejects a blank path", () => {
    expect(() => normalizeReviewScope({ paths: [" "] })).toThrow(
      "Review Scope paths must not be blank.",
    );
  });

  it("rejects too many paths", () => {
    const paths = Array.from(
      { length: REVIEW_LIMITS.reviewScopePathsPerTarget + 1 },
      (_, index) => `src/${index}`,
    );

    expect(() => normalizeReviewScope({ paths })).toThrow(
      `Review Scope may list at most ${REVIEW_LIMITS.reviewScopePathsPerTarget} paths.`,
    );
  });

  it("rejects a path that exceeds the character limit", () => {
    const path = "x".repeat(REVIEW_LIMITS.reviewScopePathCharacters + 1);

    expect(() => normalizeReviewScope({ paths: [path] })).toThrow(
      `Review Scope paths must not exceed ${REVIEW_LIMITS.reviewScopePathCharacters.toLocaleString("en-US")} characters.`,
    );
  });
});
