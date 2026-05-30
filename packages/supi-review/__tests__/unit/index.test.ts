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
        reviewInstructionBlockIds: [],
      },
      output: {
        items: [
          {
            title: "Missing guard",
            body: "A null token can still reach the validation path.",
            category: "correctness",
            impact: "high",
            effort: "low",
            recommended_action: "must-fix",
            confidence_score: 0.9,
            suggested_fix: "Add an early null guard before entering validation.",
            verification_hint:
              "Run the auth-path tests and confirm null token input fails cleanly.",
            code_location: {
              absolute_file_path: "/project/src/auth.ts",
              line_range: { start: 4, end: 5 },
            },
          },
        ],
        overall_correctness: "PATCH HAS ISSUES",
        overall_explanation: "One correctness issue remains.",
        overall_confidence_score: 0.85,
        summary: {
          actions: { mustFix: 1, shouldFix: 0, consider: 0 },
          categories: { correctness: 1 },
        },
      },
    });

    expect(content).toContain("**Model:** anthropic/claude-sonnet-4");
    expect(content).toContain("### Session-derived Brief");
    expect(content).toContain("Refactor auth flow");
    expect(content).toContain("   #1 Missing guard [must-fix]");
    expect(content).toContain("      Category: correctness");
    expect(content).toContain("      Impact: High");
    expect(content).toContain("      Effort: Low");
  });

  it("formats timeout output with partial assistant text", () => {
    const content = formatReviewContent({
      kind: "timeout",
      snapshot,
      modelId: "anthropic/claude-sonnet-4",
      timeoutMs: 60_000,
      partialOutput: "I still need to verify the auth flow.",
      debug: {
        turns: 2,
        toolUses: 1,
        recentEvents: ["tool:start:read_snapshot_diff", "agent:end"],
      },
    });

    expect(content).toContain("Review timed out");
    expect(content).toContain("Partial output:");
    expect(content).toContain("Debug:");
    expect(content).toContain("- Turns: 2");
  });

  it("formats failed output with debug details", () => {
    const content = formatReviewContent({
      kind: "failed",
      reason: "Reviewer session error: API rate limit",
      snapshot,
      modelId: "anthropic/claude-sonnet-4",
      debug: {
        turns: 1,
        toolUses: 0,
        lastAssistantStopReason: "error",
      },
    });

    expect(content).toContain("Review failed: Reviewer session error: API rate limit");
    expect(content).toContain("Debug:");
    expect(content).toContain("- Last assistant stop: error");
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
