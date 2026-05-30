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

function buildReviewItem(overrides: Record<string, unknown> = {}) {
  return {
    title: "Missing guard",
    body: "Null token path is not checked.",
    category: "correctness",
    impact: "high",
    effort: "low",
    recommended_action: "must-fix",
    confidence_score: 0.92,
    suggested_fix: "Add an early null guard before using the token.",
    verification_hint: "Run the auth-path tests and confirm null input fails cleanly.",
    code_location: {
      absolute_file_path: "/project/src/auth.ts",
      line_range: { start: 4, end: 5 },
    },
    ...overrides,
  };
}

function createSuccessResult(overrides: Record<string, unknown> = {}): ReviewResult {
  return {
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
      reviewInstructionBlockIds: [],
    },
    output: {
      items: [],
      overall_correctness: "PATCH IS CORRECT",
      overall_explanation: "Looks good",
      overall_confidence_score: 0.9,
      summary: {
        actions: { mustFix: 0, shouldFix: 0, consider: 0 },
        categories: {},
      },
      ...overrides,
    },
  } as unknown as ReviewResult;
}

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
  it("shows success output with synthesized-brief metadata and the derived verdict", () => {
    const output = renderReview(createSuccessResult());

    expect(output).toContain("Model: anthropic/claude-sonnet-4");
    expect(output).toContain("Summary: Refactor auth flow");
    expect(output).toContain("Outcome: Preserve auth semantics");
    expect(output).toContain("PATCH IS CORRECT");
  });

  it("shows expanded review items with triage, fix guidance, and verification hints", () => {
    const output = renderReview(
      createSuccessResult({
        items: [buildReviewItem()],
        overall_correctness: "PATCH HAS ISSUES",
        overall_explanation: "One review item remains.",
        summary: {
          actions: { mustFix: 1, shouldFix: 0, consider: 0 },
          categories: { correctness: 1 },
        },
      }),
      true,
    );

    expect(output).toContain("Review Items (1)");
    expect(output).toContain("#1 Missing guard");
    expect(output).toContain("[error][must-fix][/error]");
    expect(output).toContain("Category: correctness");
    expect(output).toContain("Impact: High");
    expect(output).toContain("Effort: Low");
    expect(output).toContain("Add an early null guard before using the token.");
    expect(output).toContain("Run the auth-path tests and confirm null input fails cleanly.");
  });

  it("renders must-fix items more urgently than should-fix items", () => {
    const output = renderReview(
      createSuccessResult({
        items: [
          buildReviewItem({ title: "Missing guard", recommended_action: "must-fix" }),
          buildReviewItem({
            title: "Expand test coverage",
            category: "test-gap",
            impact: "medium",
            recommended_action: "should-fix",
          }),
        ],
        overall_correctness: "PATCH HAS ISSUES",
        overall_explanation: "Two review items remain.",
        summary: {
          actions: { mustFix: 1, shouldFix: 1, consider: 0 },
          categories: { correctness: 1, "test-gap": 1 },
        },
      }),
      true,
    );

    expect(output).toContain("[text]#1 Missing guard[/text] [error][must-fix][/error]");
    expect(output).toContain(
      "[text]#2 Expand test coverage[/text] [warning][should-fix][/warning]",
    );
  });

  it("shows has-issues verdicts as warnings instead of success", () => {
    const output = renderReview(
      createSuccessResult({
        overall_correctness: "PATCH HAS ISSUES",
        overall_explanation: "Found a must-fix item.",
      }),
    );

    expect(output).toContain("[warning]●[/warning]");
    expect(output).toContain("[warning]PATCH HAS ISSUES[/warning]");
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
