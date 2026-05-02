import { describe, expect, it } from "vitest";
import { parseReviewOutput } from "../parser.ts";

describe("parseReviewOutput", () => {
  it("parses valid JSON", () => {
    const input = JSON.stringify({
      findings: [
        {
          title: "Bug",
          body: "There is a bug",
          confidence_score: 0.9,
          priority: 2,
          code_location: {
            absolute_file_path: "/tmp/a.ts",
            line_range: { start: 5, end: 10 },
          },
        },
      ],
      overall_correctness: "patch is incorrect",
      overall_explanation: "Found issues",
      overall_confidence_score: 0.8,
    });

    const result = parseReviewOutput(input);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.title).toBe("Bug");
    expect(result.findings[0]?.priority).toBe(2);
    expect(result.overall_correctness).toBe("patch is incorrect");
  });

  it("extracts JSON from surrounding text", () => {
    const input = `Here is the review:

\`\`\`json
{
  "findings": [],
  "overall_correctness": "patch is correct",
  "overall_explanation": "Looks good",
  "overall_confidence_score": 0.95
}
\`\`\`

End.`;

    const result = parseReviewOutput(input);
    expect(result.findings).toHaveLength(0);
    expect(result.overall_correctness).toBe("patch is correct");
  });

  it("falls back to plain text for invalid JSON", () => {
    const input = "This is just some plain text review.";
    const result = parseReviewOutput(input);
    expect(result.findings).toHaveLength(0);
    expect(result.overall_explanation).toBe(input);
    expect(result.overall_correctness).toBe("review incomplete");
  });

  it("clamps priority to valid range", () => {
    const input = JSON.stringify({
      findings: [
        {
          title: "A",
          body: "B",
          confidence_score: 0.5,
          priority: 99,
          code_location: { absolute_file_path: "x", line_range: { start: 1, end: 1 } },
        },
        {
          title: "C",
          body: "D",
          confidence_score: 0.5,
          priority: -5,
          code_location: { absolute_file_path: "y", line_range: { start: 1, end: 1 } },
        },
      ],
      overall_correctness: "ok",
      overall_explanation: "e",
      overall_confidence_score: 0.5,
    });

    const result = parseReviewOutput(input);
    expect(result.findings[0]?.priority).toBe(3);
    expect(result.findings[1]?.priority).toBe(0);
  });

  it("clamps confidence scores to 0-1", () => {
    const input = JSON.stringify({
      findings: [],
      overall_correctness: "ok",
      overall_explanation: "e",
      overall_confidence_score: 1.5,
    });

    const result = parseReviewOutput(input);
    expect(result.overall_confidence_score).toBe(1);
  });

  it("handles missing fields gracefully", () => {
    const input = JSON.stringify({
      findings: [
        {
          title: "Issue",
          code_location: {},
        },
      ],
      overall_correctness: "ok",
      overall_explanation: "e",
      overall_confidence_score: 0.5,
    });

    const result = parseReviewOutput(input);
    expect(result.findings[0]?.body).toBe("");
    expect(result.findings[0]?.code_location.absolute_file_path).toBe("");
    expect(result.findings[0]?.code_location.line_range.start).toBe(1);
  });
});
