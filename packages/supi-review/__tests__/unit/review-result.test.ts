import { describe, expect, it } from "vitest";
import { normalizeReviewSubmission } from "../../src/tool/review_run/submission.ts";

const finding = (overrides: Partial<{ blocksAcceptance: boolean }> = {}) => ({
  title: "Problem",
  description: "Concrete evidence.",
  blocksAcceptance: false,
  impact: "medium" as const,
  effort: "small" as const,
  confidence: 0.9,
  ...overrides,
});

describe("normalizeReviewSubmission verdict precedence", () => {
  it("derives issues from blocking findings even when criteria coverage is incomplete", () => {
    const normalized = normalizeReviewSubmission({
      summary: "Blocking gap found.",
      findings: [finding({ blocksAcceptance: true })],
      criteriaCoverage: { status: "incomplete", reason: "Issue #42 unreachable" },
    });

    expect(normalized.verdict).toBe("issues");
  });

  it("derives incomplete without blocking findings when coverage is incomplete", () => {
    const normalized = normalizeReviewSubmission({
      summary: "Partial audit.",
      findings: [finding()],
      criteriaCoverage: { status: "incomplete", reason: "Spec file missing" },
    });

    expect(normalized.verdict).toBe("incomplete");
    expect(normalized.criteriaCoverage).toEqual({
      status: "incomplete",
      reason: "Spec file missing",
    });
  });

  it("derives pass for a clean review even when criteria coverage is incomplete", () => {
    const normalized = normalizeReviewSubmission({
      summary: "Clean.",
      findings: [],
      criteriaCoverage: { status: "incomplete", reason: "Spec file missing" },
    });

    // A clean review must not surface as INCOMPLETE: the coverage line still
    // prints, but the verdict reflects that nothing was found.
    expect(normalized.verdict).toBe("pass");
    expect(normalized.criteriaCoverage).toEqual({
      status: "incomplete",
      reason: "Spec file missing",
    });
  });

  it("derives pass_with_findings when coverage is complete with advisory findings", () => {
    const normalized = normalizeReviewSubmission({
      summary: "Advisory notes only.",
      findings: [finding()],
      criteriaCoverage: { status: "complete" },
    });

    expect(normalized.verdict).toBe("pass_with_findings");
  });

  it("derives pass when coverage is complete and there are no findings", () => {
    const normalized = normalizeReviewSubmission({
      summary: "Clean.",
      findings: [],
      criteriaCoverage: { status: "complete" },
    });

    expect(normalized.verdict).toBe("pass");
  });

  it("requires criteria coverage", () => {
    expect(() =>
      normalizeReviewSubmission({ summary: "Missing coverage.", findings: [] } as never),
    ).toThrow(/include criteria coverage/i);
  });

  it("rejects incomplete coverage without a reason", () => {
    expect(() =>
      normalizeReviewSubmission({
        summary: "Partial.",
        findings: [],
        criteriaCoverage: { status: "incomplete" } as never,
      }),
    ).toThrow(/criteria coverage reason/i);
  });

  it("drops a stray reason when coverage is complete", () => {
    const normalized = normalizeReviewSubmission({
      summary: "Contradictory coverage.",
      findings: [],
      criteriaCoverage: { status: "complete", reason: "Issue unavailable" } as never,
    });

    // A model that treats the reason field as required must still be able to
    // deliver a valid complete submission; the stray reason is discarded.
    expect(normalized.verdict).toBe("pass");
    expect(normalized.criteriaCoverage).toEqual({ status: "complete" });
  });

  it("rejects oversized coverage reasons", () => {
    expect(() =>
      normalizeReviewSubmission({
        summary: "Partial.",
        findings: [],
        criteriaCoverage: { status: "incomplete", reason: "x".repeat(501) },
      }),
    ).toThrow(/criteria coverage reason/i);
  });
});

describe("normalizeReviewSubmission unchanged grammar", () => {
  it("derives an issues verdict without reordering findings", () => {
    const result = normalizeReviewSubmission({
      summary: "Two findings.",
      criteriaCoverage: { status: "complete" },
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
    expect(result.findings.map((f) => f.title)).toEqual(["Advisory first", "Blocking second"]);
  });

  it("defaults an omitted finding end line to its start line", () => {
    const result = normalizeReviewSubmission({
      summary: "One finding.",
      criteriaCoverage: { status: "complete" },
      findings: [
        {
          title: "Finding",
          description: "Evidence.",
          blocksAcceptance: true,
          impact: "high",
          effort: "small",
          confidence: 1,
          location: { path: "@src/file.ts", startLine: 10 },
        },
      ],
    });

    expect(result.findings[0]?.location).toEqual({
      path: "src/file.ts",
      startLine: 10,
      endLine: 10,
    });
  });

  it("distinguishes advisory findings from a clean pass and counts their impact", () => {
    const advisory = normalizeReviewSubmission({
      summary: "One advisory.",
      criteriaCoverage: { status: "complete" },
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
    const clean = normalizeReviewSubmission({
      summary: "No findings.",
      findings: [],
      criteriaCoverage: { status: "complete" },
    });

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
        criteriaCoverage: { status: "complete" },
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

    expect(() =>
      normalizeReviewSubmission({
        summary: "x".repeat(8_001),
        findings: [],
        criteriaCoverage: { status: "complete" },
      }),
    ).toThrow(/summary.*8,000/i);
  });

  it.each(["/tmp/file.ts", "../outside.ts", "C:\\secret.ts", "bad\0path.ts"])(
    "rejects non-relative finding location: %s",
    (path) => {
      expect(() =>
        normalizeReviewSubmission({
          summary: "Invalid location.",
          criteriaCoverage: { status: "complete" },
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
          criteriaCoverage: { status: "complete" },
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
