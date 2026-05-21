import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import reviewExtension from "../../src/review.ts";
import { formatReviewContent } from "../../src/ui/format-content.ts";

const snapshot = {
  target: { kind: "working-tree" as const },
  title: "Working tree changes",
  changedFiles: ["src/auth.ts"],
  diffText: "",
  stats: { files: 1, additions: 2, deletions: 0 },
};

describe("formatReviewContent", () => {
  it("formats success output with the synthesized brief", () => {
    const content = formatReviewContent({
      kind: "success",
      snapshot,
      modelId: "anthropic/claude-sonnet-4",
      brief: {
        summary: "Refactor auth flow",
        intendedOutcome: "Preserve behavior while simplifying control flow",
        constraints: ["Keep public API stable"],
        focusAreas: ["Authentication", "Error handling"],
        riskyFiles: ["src/auth.ts"],
        unresolvedQuestions: [],
        evidenceCount: 2,
      },
      output: {
        findings: [
          {
            title: "Missing guard",
            body: "A null token can still reach the validation path.",
            confidence_score: 0.9,
            priority: 2,
            code_location: {
              absolute_file_path: "/project/src/auth.ts",
              line_range: { start: 4, end: 5 },
            },
          },
        ],
        overall_correctness: "mostly correct",
        overall_explanation: "One correctness issue remains.",
        overall_confidence_score: 0.85,
      },
    });

    expect(content).toContain("**Model:** anthropic/claude-sonnet-4");
    expect(content).toContain("### Session-derived Brief");
    expect(content).toContain("Refactor auth flow");
    expect(content).toContain("#1 [major] Missing guard");
  });

  it("formats timeout output with partial assistant text", () => {
    const content = formatReviewContent({
      kind: "timeout",
      snapshot,
      modelId: "anthropic/claude-sonnet-4",
      timeoutMs: 60_000,
      partialOutput: "I still need to verify the auth flow.",
    });

    expect(content).toContain("Review timed out");
    expect(content).toContain("Partial output:");
  });
});

describe("/supi-review command registration", () => {
  it("registers the command and renderer without settings hooks", () => {
    const pi = {
      registerCommand: vi.fn(),
      registerMessageRenderer: vi.fn(),
      sendMessage: vi.fn(),
      events: { emit: vi.fn(), on: vi.fn() },
    } as unknown as ExtensionAPI;

    reviewExtension(pi);

    expect(pi.registerCommand).toHaveBeenCalledWith(
      "supi-review",
      expect.objectContaining({ description: expect.any(String) }),
    );
    expect(pi.registerMessageRenderer).toHaveBeenCalledWith("supi-review", expect.any(Function));
  });
});
