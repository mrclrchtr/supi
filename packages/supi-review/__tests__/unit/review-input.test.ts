import { describe, expect, it } from "vitest";
import { normalizeReviewInput } from "../../src/review-input.ts";

describe("normalizeReviewInput criteria sources", () => {
  it("trims and preserves caller-supplied criteria sources", () => {
    const review = normalizeReviewInput({
      tasks: [
        {
          id: "spec",
          instructions: "Check the spec.",
          mode: "change",
          criteriaSources: [{ reference: " #123 ", summary: " Acceptance criteria. " }],
        },
      ],
    });

    expect(review.tasks[0].criteriaSources).toEqual([
      { reference: "#123", summary: "Acceptance criteria." },
    ]);
  });

  it("rejects blank criteria references or summaries", () => {
    expect(() =>
      normalizeReviewInput({
        tasks: [
          {
            id: "spec",
            instructions: "Check the spec.",
            mode: "change",
            criteriaSources: [{ reference: " ", summary: "Summary" }],
          },
        ],
      }),
    ).toThrow(/criteria source/i);
  });

  it("rejects too many criteria sources on one task", () => {
    const sources = Array.from({ length: 6 }, (_, index) => ({
      reference: `#ref-${index}`,
      summary: "Summary",
    }));
    expect(() =>
      normalizeReviewInput({
        tasks: [{ id: "spec", instructions: "Check.", mode: "change", criteriaSources: sources }],
      }),
    ).toThrow(/criteria sources/i);
  });

  it("deduplicates identical sources and rejects conflicting duplicate summaries", () => {
    expect(
      normalizeReviewInput({
        tasks: [
          {
            id: "spec",
            instructions: "Check.",
            mode: "change",
            criteriaSources: [
              { reference: " #1 ", summary: " Summary " },
              { reference: "#1", summary: "Summary" },
            ],
          },
        ],
      }).tasks[0].criteriaSources,
    ).toEqual([{ reference: "#1", summary: "Summary" }]);

    expect(() =>
      normalizeReviewInput({
        tasks: [
          {
            id: "spec",
            instructions: "Check.",
            mode: "change",
            criteriaSources: [
              { reference: "#1", summary: "First" },
              { reference: "#1", summary: "Second" },
            ],
          },
        ],
      }),
    ).toThrow(/repeats criteria source/i);
  });

  it("rejects oversized criteria references and summaries", () => {
    expect(() =>
      normalizeReviewInput({
        tasks: [
          {
            id: "spec",
            instructions: "Check.",
            mode: "change",
            criteriaSources: [{ reference: "x".repeat(257), summary: "Summary" }],
          },
        ],
      }),
    ).toThrow(/criteria source reference/i);
    expect(() =>
      normalizeReviewInput({
        tasks: [
          {
            id: "spec",
            instructions: "Check.",
            mode: "change",
            criteriaSources: [{ reference: "#1", summary: "x".repeat(2001) }],
          },
        ],
      }),
    ).toThrow(/criteria source summary/i);
  });
});
