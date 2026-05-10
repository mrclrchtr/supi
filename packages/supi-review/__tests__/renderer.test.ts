import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { registerReviewRenderer } from "../src/renderer.ts";
import type { ReviewResult } from "../src/types.ts";

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
  it("shows incorrect verdicts as warnings instead of success", () => {
    const output = renderReview({
      kind: "success",
      target: { type: "custom", instructions: "Focus on correctness" },
      output: {
        findings: [],
        overall_correctness: "patch is incorrect",
        overall_explanation: "Found a bug",
        overall_confidence_score: 0.9,
      },
    });

    expect(output).toContain("[warning]●[/warning]");
    expect(output).toContain("[warning]patch is incorrect[/warning]");
    expect(output).not.toContain("[success]patch is incorrect[/success]");
  });

  it("shows timeout without tmux-specific warnings", () => {
    const output = renderReview({
      kind: "timeout",
      target: { type: "custom", instructions: "Focus on correctness" },
      timeoutMs: 900_000,
    });

    expect(output).toContain("[warning]◆ Review Timed Out[/warning]");
    expect(output).not.toContain("tmux");
  });

  it("shows timeout with partial output", () => {
    const output = renderReview({
      kind: "timeout",
      target: { type: "custom", instructions: "Focus on correctness" },
      timeoutMs: 900_000,
      partialOutput: "I reviewed the code and found issues with...",
    });

    expect(output).toContain("[warning]◆ Review Timed Out[/warning]");
    expect(output).toContain("Partial output:");
    expect(output).toContain("I reviewed the code and found issues with...");
  });

  it("shows failed result without tmux warnings", () => {
    const output = renderReview({
      kind: "failed",
      reason: "Reviewer session error: API rate limit",
      target: { type: "custom", instructions: "Focus on correctness" },
    });

    expect(output).toContain("[error]◆ Review Failed[/error]");
    expect(output).toContain("API rate limit");
    expect(output).not.toContain("tmux");
  });

  it("shows canceled result without tmux warnings", () => {
    const output = renderReview({
      kind: "canceled",
      target: { type: "custom", instructions: "Focus on correctness" },
    });

    expect(output).toContain("[warning]◆ Review Canceled[/warning]");
    expect(output).not.toContain("tmux");
  });
});
