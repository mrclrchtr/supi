import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { ReviewResult } from "../../src/types.ts";
import { registerReviewRenderer } from "../../src/ui/renderer.ts";

const snapshot = {
  target: { kind: "working-tree" as const },
  title: "Working tree changes",
  changedFiles: ["src/auth.ts"],
  diffText: "",
  stats: { files: 1, additions: 1, deletions: 0 },
};

function createPiWithRenderer() {
  const renderers = new Map<string, (...args: unknown[]) => unknown>();
  const pi = {
    registerMessageRenderer(customType: string, renderer: (...args: unknown[]) => unknown) {
      renderers.set(customType, renderer);
    },
  } as unknown as ExtensionAPI;
  return { pi, renderers };
}

function createTheme() {
  return {
    fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
    bg: (_color: string, text: string) => text,
  };
}

function renderReview(result: ReviewResult, expanded = false): string {
  const { pi, renderers } = createPiWithRenderer();
  registerReviewRenderer(pi);

  const renderer = renderers.get("supi-review");
  if (!renderer) throw new Error("supi-review renderer was not registered");

  const output = renderer(
    {
      role: "custom",
      customType: "supi-review",
      content: "summary",
      display: true,
      details: { result },
      timestamp: Date.now(),
    },
    { expanded },
    createTheme(),
  );

  return (output as { render: (width: number) => string[] }).render(100).join("\n");
}

describe("supi-review renderer", () => {
  it("shows success output with synthesized-brief metadata", () => {
    const output = renderReview({
      kind: "success",
      snapshot,
      modelId: "anthropic/claude-sonnet-4",
      brief: {
        summary: "Refactor auth flow",
        intendedOutcome: "Preserve auth semantics",
        constraints: ["Keep the public API stable"],
        focusAreas: ["Authentication", "Error handling"],
        riskyFiles: ["src/auth.ts"],
        unresolvedQuestions: [],
        evidenceCount: 2,
      },
      output: {
        findings: [],
        overall_correctness: "patch is correct",
        overall_explanation: "Looks good",
        overall_confidence_score: 0.9,
      },
    });

    expect(output).toContain("Model: anthropic/claude-sonnet-4");
    expect(output).toContain("Summary: Refactor auth flow");
    expect(output).toContain("Outcome: Preserve auth semantics");
  });

  it("shows incorrect verdicts as warnings instead of success", () => {
    const output = renderReview({
      kind: "success",
      snapshot,
      modelId: "anthropic/claude-sonnet-4",
      output: {
        findings: [],
        overall_correctness: "patch is incorrect",
        overall_explanation: "Found a bug",
        overall_confidence_score: 0.9,
      },
    });

    expect(output).toContain("[warning]●[/warning]");
    expect(output).toContain("[warning]patch is incorrect[/warning]");
  });

  it("shows timeout with partial output", () => {
    const output = renderReview({
      kind: "timeout",
      snapshot,
      modelId: "anthropic/claude-sonnet-4",
      timeoutMs: 900_000,
      partialOutput: "I reviewed the code and found issues with...",
    });

    expect(output).toContain("[warning]◆ Review Timed Out[/warning]");
    expect(output).toContain("Partial output:");
  });

  it("shows failed result details", () => {
    const output = renderReview({
      kind: "failed",
      reason: "Reviewer session error: API rate limit",
      snapshot,
      modelId: "anthropic/claude-sonnet-4",
    });

    expect(output).toContain("[error]◆ Review Failed[/error]");
    expect(output).toContain("API rate limit");
  });

  it("shows canceled result", () => {
    const output = renderReview({
      kind: "canceled",
      snapshot,
      modelId: "anthropic/claude-sonnet-4",
    });

    expect(output).toContain("[warning]◆ Review Canceled[/warning]");
  });
});
