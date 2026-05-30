import { readFileSync, unlinkSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ReviewPlan } from "../../src/types.ts";
import {
  exportReviewPromptToTempFile,
  ReviewPlanPreviewComponent,
} from "../../src/ui/review-plan-inspector.ts";

function createTheme() {
  return {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };
}

type PlanOverrides = {
  snapshot?: Partial<ReviewPlan["snapshot"]>;
  brief?: Partial<ReviewPlan["brief"]>;
  packet?: Partial<ReviewPlan["packet"]>;
};

function createPlan(overrides: PlanOverrides = {}): ReviewPlan {
  const basePlan: ReviewPlan = {
    model: {
      canonicalId: "anthropic/claude-sonnet-4",
      provider: "anthropic",
      id: "claude-sonnet-4",
      label: "Claude Sonnet 4",
      description: "anthropic/claude-sonnet-4",
      isCurrent: true,
      model: {
        provider: "anthropic",
        id: "claude-sonnet-4",
        name: "Claude Sonnet 4",
        reasoning: false,
        contextWindow: 200_000,
        api: {} as never,
        baseUrl: "",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        maxTokens: 8_000,
      },
    },
    snapshot: {
      target: { kind: "working-tree" },
      title: "Working tree changes",
      changedFiles: ["src/auth.ts"],
      diffText: "diff --git a/src/auth.ts b/src/auth.ts\n- old\n+ new",
      stats: { files: 1, additions: 1, deletions: 1 },
    },
    brief: {
      summary: "Refactor auth flow",
      intendedOutcome: "Preserve auth semantics",
      constraints: ["Keep the public API stable"],
      focusAreas: ["Authentication"],
      riskyFiles: ["src/auth.ts"],
      unresolvedQuestions: [],
    },
    packet: {
      prompt: Array.from(
        { length: 40 },
        (_, index) => `Prompt line ${String(index + 1).padStart(2, "0")}`,
      ).join("\n"),
      includedFiles: ["src/auth.ts"],
      omittedFiles: [],
      charBudget: 32_000,
    },
  };

  return {
    ...basePlan,
    snapshot: { ...basePlan.snapshot, ...overrides.snapshot },
    brief: { ...basePlan.brief, ...overrides.brief },
    packet: { ...basePlan.packet, ...overrides.packet },
  };
}

function createComponent(overrides?: { exportPath?: string; plan?: ReviewPlan }) {
  const onDone = vi.fn();
  const requestRender = vi.fn();
  const exportPrompt = vi.fn(() => overrides?.exportPath ?? "/tmp/supi-review-prompt.txt");
  const component = new ReviewPlanPreviewComponent({
    plan: overrides?.plan ?? createPlan(),
    theme: createTheme(),
    onDone,
    requestRender,
    exportPrompt,
  });

  return { component, onDone, requestRender, exportPrompt };
}

function renderWithScroll(component: ReviewPlanPreviewComponent, steps: number, width = 200) {
  const outputs = [component.render(width).join("\n")];

  for (let index = 0; index < steps; index += 1) {
    component.handleInput("j");
    outputs.push(component.render(width).join("\n"));
  }

  return outputs.join("\n---\n");
}

describe("ReviewPlanPreviewComponent", () => {
  it("renders overview content from shared preview data before toggling to raw prompt mode", () => {
    const { component, onDone } = createComponent({
      plan: createPlan({
        snapshot: {
          changedFiles: ["packages/supi-code-intelligence/src/tool/tool-specs.ts"],
          diffText: [
            "=== Snapshot notes ===",
            "diff --git a/packages/supi-code-intelligence/src/tool/tool-specs.ts b/packages/supi-code-intelligence/src/tool/tool-specs.ts",
            "--- a/packages/supi-code-intelligence/src/tool/tool-specs.ts",
            "+++ b/packages/supi-code-intelligence/src/tool/tool-specs.ts",
            "@@ -1 +1 @@",
            '- "code_calls"',
            '+ "code_graph"',
          ].join("\n"),
        },
        brief: {
          focusAreas: ["Tool names"],
          riskyFiles: ["packages/supi-code-intelligence/src/tool/tool-specs.ts"],
        },
      }),
    });

    expect(component.render(200).join("\n")).toContain("Review Plan");

    component.handleInput("v");
    let output = renderWithScroll(component, 16);
    expect(output).toContain("Review Plan Inspector");
    expect(output).toContain("Inspector: Overview");
    expect(output).toContain("Keep the public API stable");
    expect(output).toContain("Tool names");
    expect(output).toContain("Public-surface / rename / merge audit");
    expect(output).toContain(
      "packages/supi-code-intelligence/src/tool/tool-specs.ts — +1 / -1 (trivial)",
    );
    expect(output).toContain("Snapshot notes");
    expect(onDone).not.toHaveBeenCalled();

    component.handleInput("\t");
    output = component.render(200).join("\n");
    expect(output).toContain("Inspector: Raw Prompt");
    expect(output).toContain("Prompt line 01");
  });

  it("renders fallback overview text and omits empty optional sections", () => {
    const { component } = createComponent({
      plan: createPlan({
        brief: {
          constraints: [],
          focusAreas: [],
          riskyFiles: [],
        },
      }),
    });

    component.handleInput("v");
    const output = renderWithScroll(component, 12);

    expect(output).toContain("No explicit constraints extracted.");
    expect(output).toContain("Review overall correctness and consistency.");
    expect(output).toContain("No risky files explicitly called out.");
    expect(output).not.toContain("Audit hints");
    expect(output).not.toContain("Snapshot notes");
  });

  it("scrolls long raw prompt content with arrow keys and j/k", () => {
    const { component } = createComponent();

    component.handleInput("v");
    component.handleInput("\t");
    expect(component.render(100).join("\n")).toContain("Prompt line 01");

    component.handleInput("j");
    let output = component.render(100).join("\n");
    expect(output).not.toContain("Prompt line 01");
    expect(output).toContain("Prompt line 02");

    component.handleInput("\u001b[B");
    output = component.render(100).join("\n");
    expect(output).not.toContain("Prompt line 02");
    expect(output).toContain("Prompt line 03");

    component.handleInput("k");
    output = component.render(100).join("\n");
    expect(output).toContain("Prompt line 02");

    component.handleInput("\u001b[A");
    output = component.render(100).join("\n");
    expect(output).toContain("Prompt line 01");
  });

  it("returns from the inspector to the summary before canceling the review", () => {
    const { component, onDone } = createComponent();

    component.handleInput("v");
    component.handleInput("\u001b");
    expect(component.render(100).join("\n")).toContain("Review Plan");
    expect(onDone).not.toHaveBeenCalled();

    component.handleInput("\u001b");
    expect(onDone).toHaveBeenCalledWith(false);
  });

  it("approves only from the summary screen", () => {
    const { component, onDone } = createComponent();

    component.handleInput("v");
    component.handleInput("\r");
    expect(onDone).not.toHaveBeenCalled();

    component.handleInput("q");
    component.handleInput("y");
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it("exports the raw prompt and shows the temp-file path", () => {
    const { component, exportPrompt } = createComponent({
      exportPath: "/tmp/supi-review-prompt-123.txt",
    });

    component.handleInput("v");
    component.handleInput("e");

    expect(exportPrompt).toHaveBeenCalledWith(expect.stringContaining("Prompt line 01"));
    expect(component.render(100).join("\n")).toContain("/tmp/supi-review-prompt-123.txt");
  });
});

describe("exportReviewPromptToTempFile", () => {
  it("reuses the same temp-file path and overwrites previous exports", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);

    const firstPath = exportReviewPromptToTempFile("first prompt");
    const secondPath = exportReviewPromptToTempFile("second prompt");

    try {
      expect(secondPath).toBe(firstPath);
      expect(readFileSync(secondPath, "utf-8")).toBe("second prompt");
    } finally {
      nowSpy.mockRestore();
      for (const path of new Set([firstPath, secondPath])) {
        try {
          unlinkSync(path);
        } catch {
          // best-effort cleanup
        }
      }
    }
  });
});
