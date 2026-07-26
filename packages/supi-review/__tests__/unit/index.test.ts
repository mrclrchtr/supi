import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTools } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
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

  it("formats timeout output with safe lifecycle diagnostics only", () => {
    const content = formatReviewContent({
      kind: "timeout",
      snapshot,
      modelId: "anthropic/claude-sonnet-4",
      timeoutMs: 60_000,
      diagnostics: {
        turns: 2,
        toolUses: 1,
        recentActivity: ["tool:start:read_snapshot_diff"],
        lifecycleTrace: {
          entries: [{ type: "timeout_expired" }, { type: "abort_requested", reason: "timeout" }],
          droppedCount: 0,
        },
      },
    });

    expect(content).toContain("Reviewer timed out.");
    expect(content).toContain("Diagnostics:");
    expect(content).toContain("- Turns: 2");
    expect(content).toContain("Child Lifecycle Trace (observed tail)");
    expect(content).not.toContain("Partial output:");
  });

  it("formats host-owned failed output with safe diagnostics", () => {
    const content = formatReviewContent({
      kind: "failed",
      failureCode: "unexpected-runner-failure",
      snapshot,
      modelId: "anthropic/claude-sonnet-4",
      diagnostics: {
        turns: 1,
        toolUses: 0,
        lifecycleTrace: { entries: [{ type: "agent_settled" }], droppedCount: 0 },
        lastAssistantStopReason: "error",
      },
    });

    expect(content).toContain("Reviewer ended unexpectedly.");
    expect(content).toContain("Diagnostics:");
    expect(content).toContain("- Last assistant stop: error");
    expect(content).not.toContain("API rate limit");
  });
});

describe("/supi-review extension registration", () => {
  it("registers the command, renderer, and two-stage agent tools", () => {
    const pi = createPiMock();

    reviewExtension(pi as unknown as ExtensionAPI);

    expect(pi.commands.has("supi-review")).toBe(true);
    expect(pi.renderers.has("supi-review")).toBe(true);
    expect(getTools(pi).map((tool) => tool.name)).toEqual([
      "supi_review_prepare",
      "supi_review_run",
    ]);
  });
});
