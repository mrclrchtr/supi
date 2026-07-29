import { describe, expect, it } from "vitest";
import { normalizeReviewSubmission } from "../../src/review-result.ts";

describe("normalizeReviewSubmission", () => {
  it("derives an issues verdict without reordering findings", () => {
    const result = normalizeReviewSubmission({
      summary: "Two findings.",
      findings: [
        {
          title: "Advisory first",
          description: "Worth considering.",
          blocksAcceptance: false,
          impact: "low",
          effort: "small",
          confidence: 0.7,
        },
        {
          title: "Blocking second",
          description: "Breaks the requested behavior.",
          blocksAcceptance: true,
          impact: "high",
          effort: "medium",
          confidence: 0.95,
        },
      ],
    });

    expect(result.verdict).toBe("issues");
    expect(result.findings.map((finding) => finding.title)).toEqual([
      "Advisory first",
      "Blocking second",
    ]);
  });

  it("distinguishes advisory findings from a clean pass and counts their impact", () => {
    const advisory = normalizeReviewSubmission({
      summary: "One advisory.",
      findings: [
        {
          title: "Consider this",
          description: "It is not acceptance-blocking.",
          blocksAcceptance: false,
          impact: "medium",
          effort: "small",
          confidence: 0.7,
        },
      ],
    });
    const clean = normalizeReviewSubmission({ summary: "No findings.", findings: [] });

    expect(advisory.verdict).toBe("pass_with_findings");
    expect(advisory.findingCounts).toEqual({
      total: 1,
      blocking: 0,
      nonBlocking: 1,
      byImpact: { low: 0, medium: 1, high: 0 },
    });
    expect(clean.verdict).toBe("pass");
    expect(clean.findingCounts).toEqual({
      total: 0,
      blocking: 0,
      nonBlocking: 0,
      byImpact: { low: 0, medium: 0, high: 0 },
    });
  });

  it("rejects reviewer output that exceeds persisted result bounds", () => {
    expect(() =>
      normalizeReviewSubmission({
        summary: "bounded",
        findings: Array.from({ length: 21 }, (_, index) => ({
          title: `Finding ${index}`,
          description: "Description",
          blocksAcceptance: false,
          impact: "low" as const,
          effort: "small" as const,
          confidence: 1,
        })),
      }),
    ).toThrow(/20 findings/i);

    expect(() => normalizeReviewSubmission({ summary: "x".repeat(8_001), findings: [] })).toThrow(
      /summary.*8,000/i,
    );
  });

  it.each(["/tmp/file.ts", "../outside.ts", "C:\\secret.ts", "bad\0path.ts"])(
    "rejects non-relative finding location: %s",
    (path) => {
      expect(() =>
        normalizeReviewSubmission({
          summary: "Invalid location.",
          findings: [
            {
              title: "Finding",
              description: "Description",
              blocksAcceptance: false,
              impact: "low",
              effort: "small",
              confidence: 0.8,
              location: { path, startLine: 1, endLine: 1 },
            },
          ],
        }),
      ).toThrow(/path|repository/i);
    },
  );

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects confidence outside the closed 0..1 range: %s",
    (confidence) => {
      expect(() =>
        normalizeReviewSubmission({
          summary: "Invalid confidence.",
          findings: [
            {
              title: "Finding",
              description: "Description",
              blocksAcceptance: false,
              impact: "low",
              effort: "small",
              confidence,
            },
          ],
        }),
      ).toThrow(/confidence/i);
    },
  );
});
