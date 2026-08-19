import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import type { ContextAnalysis } from "../../src/analysis.ts";
import type { ContextPressureSnapshot } from "../../src/capacity.ts";
import {
  type ContextToolDetails,
  renderContextToolCall,
  renderContextToolResult,
} from "../../src/tool/render.ts";

const mockTheme = {
  fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
  bold: (text: string) => `**${text}**`,
} as unknown as Theme;

const plainTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

function makeSnapshot(overrides?: Partial<ContextPressureSnapshot>): ContextPressureSnapshot {
  return {
    modelName: "Test Model",
    contextWindow: 100_000,
    usedTokens: 50_000,
    usagePercent: 50,
    compactionEnabled: true,
    reserveTokens: 16_384,
    headroomTokens: 33_616,
    pressurePercent: 59.8,
    compacted: true,
    approximationNote: null,
    ...overrides,
  };
}

function makeAnalysis(overrides?: Partial<ContextAnalysis>): ContextAnalysis {
  return {
    ...makeSnapshot(),
    scaled: true,
    categories: {
      systemPrompt: 10_000,
      userMessages: 15_000,
      assistantMessages: 20_000,
      toolCalls: 2_000,
      toolResults: 3_000,
      other: 0,
    },
    systemPromptBreakdown: {
      base: 5_000,
      instructionFiles: [],
      contextFiles: [],
      skills: [],
      guidelines: 500,
      toolSnippets: 300,
      toolSnippetDetails: [{ name: "read", tokens: 50 }],
      guidelineSources: [{ source: "default", tokens: 200, bulletCount: 2 }],
      appendText: 200,
    },
    injectedFiles: [],
    skills: [],
    guidelines: 500,
    guidelineBullets: ["Be concise"],
    guidelineSources: [{ source: "default", tokens: 200, bulletCount: 2 }],
    toolSnippetDetails: [{ name: "read", tokens: 50 }],
    toolDefinitions: {
      count: 1,
      tokens: 500,
      tools: [{ name: "read", description: "Read files", tokens: 500 }],
    },
    providerSections: [],
    ...overrides,
  };
}

function renderText(component: { render(width: number): string[] }, width = 160): string {
  return component.render(width).join("\n");
}

describe("context_report tool rendering", () => {
  it("renders the requested mode in a compact tool-call header", () => {
    const output = renderText(renderContextToolCall({ mode: "concise" }, mockTheme));

    expect(output).toContain("context_report");
    expect(output).toContain("concise");
  });

  it("renders concise details without storing or leaking a diagnostic report", () => {
    const details = {
      mode: "concise",
      snapshot: makeSnapshot(),
    } satisfies ContextToolDetails;
    const output = renderText(
      renderContextToolResult(
        {
          content: [{ type: "text", text: '{"raw":"agent-facing-json"}' }],
          details,
        },
        { expanded: false, isPartial: false },
        plainTheme,
      ),
    );

    expect(output).toContain("headroom");
    expect(output).toContain("Test Model");
    expect(output).not.toContain("agent-facing-json");
    expect(output).not.toContain("Usage by category");
  });

  it("renders every snapshot metric as a narrow, aligned expanded block", () => {
    const details = {
      mode: "concise",
      snapshot: makeSnapshot(),
    } satisfies ContextToolDetails;
    const component = renderContextToolResult(
      { content: [{ type: "text", text: "{}" }], details },
      { expanded: true, isPartial: false },
      plainTheme,
    );
    const lines = component.render(32);
    const output = lines.join("\n");

    for (const label of [
      "Model",
      "Context window",
      "Used",
      "Usage",
      "Auto-compaction",
      "Compaction reserve",
      "Headroom",
      "Pressure",
      "Compacted",
    ]) {
      expect(output).toContain(label);
    }
    expect(output).not.toContain("Usage by category");
    expect(lines.every((line) => visibleWidth(line) <= 32)).toBe(true);
  });

  it("renders full details as a diagnostic Context Usage Report", () => {
    const details = {
      mode: "full",
      analysis: makeAnalysis(),
    } satisfies ContextToolDetails;
    const output = renderText(
      renderContextToolResult(
        { content: [{ type: "text", text: "{}" }], details },
        { expanded: true, isPartial: false },
        mockTheme,
      ),
    );

    expect(output).toContain("Context Usage");
    expect(output).toContain("Usage by category");
    expect(output).toContain("System prompt composition");
  });

  it("renders partial and error states", () => {
    const partial = renderText(
      renderContextToolResult(undefined, { expanded: false, isPartial: true }, mockTheme),
    );
    const failed = renderText(
      renderContextToolResult(
        { content: [], isError: true },
        { expanded: false, isPartial: false },
        mockTheme,
      ),
    );

    expect(partial).toContain("Analyzing context…");
    expect(failed).toContain("context_report failed");
  });
});
