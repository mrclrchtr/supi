import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { registerReviewRenderer } from "../renderer.ts";
import type { ReviewResult } from "../types.ts";

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
});
