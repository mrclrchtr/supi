import { describe, expect, it } from "vitest";
import type { AgentReviewBatchDetails } from "../../src/types.ts";
import { renderRunReviewCall, renderRunReviewResult } from "../../src/ui/review-tool-renderer.ts";

const brief = {
  summary: "Guard the auth flow",
  intendedOutcome: "Reject missing tokens",
  constraints: ["Keep the public API stable"],
  focusAreas: ["Authentication"],
  riskyFiles: ["src/auth.ts"],
  unresolvedQuestions: [],
  reviewInstructionBlockIds: [],
};

const critique = {
  verdict: "revise" as const,
  summary: "The brief omitted regression coverage.",
  findings: [
    {
      kind: "omission" as const,
      field: "focusAreas" as const,
      explanation: "Tests are not included in the focus.",
      evidence: "The user requested a missing-token regression test.",
      proposedChange: "Add regression coverage to focusAreas.",
    },
  ],
};

function theme() {
  return {
    fg: (_color: string, text: string) => text,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };
}

function render(component: unknown): string {
  return (component as { render: (width: number) => string[] }).render(120).join("\n");
}

describe("agent review tool rendering", () => {
  it("shows the full critique and proposed revised brief in expanded calls", () => {
    const output = render(
      renderRunReviewCall(
        {
          planId: "review-plan-123",
          critique,
          revisedBrief: { ...brief, focusAreas: ["Authentication", "Regression coverage"] },
          reviewers: [{ id: "tests", focus: "Review regression coverage." }],
        },
        true,
        theme() as never,
      ),
    );

    expect(output).toContain(critique.summary);
    expect(output).toContain(critique.findings[0].evidence);
    expect(output).toContain(critique.findings[0].proposedChange);
    expect(output).toContain("Proposed revised brief");
    expect(output).toContain("Regression coverage");
  });

  it("shows each failed reviewer's lifecycle diagnostics in expanded results", () => {
    const details: AgentReviewBatchDetails = {
      kind: "review-batch",
      evaluation: {
        planId: "review-plan-123",
        briefPromptVersion: "1",
        generatedBrief: brief,
        critique,
        effectiveBrief: brief,
        synthesizerModelId: "anthropic/claude-sonnet-4",
        snapshotFingerprint: "fingerprint",
      },
      snapshot: {
        target: { kind: "working-tree" },
        title: "Working tree changes",
        changedFiles: ["src/auth.ts"],
        stats: { files: 1, additions: 1, deletions: 0 },
      },
      results: [
        {
          assignment: { id: "spec", focus: "Check behavior." },
          result: {
            kind: "failed",
            failureCode: "missing-structured-output",
            modelId: "anthropic/claude-sonnet-4",
            diagnostics: {
              turns: 1,
              toolUses: 0,
              lifecycleTrace: {
                entries: [{ type: "agent_settled" }],
                droppedCount: 0,
              },
            },
          },
        },
      ],
    };

    const output = render(renderRunReviewResult({ content: [], details }, true, theme() as never));

    expect(output).toContain("Reviewer diagnostics");
    expect(output).toContain("spec");
    expect(output).toContain("Child Lifecycle Trace (observed tail)");
  });

  it("shows the retained critique in expanded completed results", () => {
    const details: AgentReviewBatchDetails = {
      kind: "review-batch",
      evaluation: {
        planId: "review-plan-123",
        briefPromptVersion: "1",
        generatedBrief: brief,
        critique,
        effectiveBrief: { ...brief, focusAreas: ["Authentication", "Regression coverage"] },
        synthesizerModelId: "anthropic/claude-sonnet-4",
        snapshotFingerprint: "fingerprint",
      },
      snapshot: {
        target: { kind: "working-tree" },
        title: "Working tree changes",
        changedFiles: ["src/auth.ts"],
        stats: { files: 1, additions: 1, deletions: 0 },
      },
      results: [],
    };

    const output = render(renderRunReviewResult({ content: [], details }, true, theme() as never));

    expect(output).toContain(critique.summary);
    expect(output).toContain("Effective revised brief");
    expect(output).toContain("Regression coverage");
  });
});
