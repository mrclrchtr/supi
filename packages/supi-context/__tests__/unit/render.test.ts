import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { ContextAnalysis } from "../../src/analysis.ts";
import {
  type ContextToolDetails,
  renderContextToolCall,
  renderContextToolResult,
} from "../../src/tool/render.ts";

const mockTheme = {
  fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
  bold: (text: string) => `**${text}**`,
} as unknown as Theme;

function makeAnalysis(overrides?: Partial<ContextAnalysis>): ContextAnalysis {
  return {
    modelName: "Test Model",
    contextWindow: 100_000,
    totalTokens: 50_000,
    scaled: true,
    approximationNote: null,
    full: true,
    categories: {
      systemPrompt: 10_000,
      userMessages: 15_000,
      assistantMessages: 20_000,
      toolCalls: 2_000,
      toolResults: 3_000,
      other: 0,
      autocompactBuffer: 16_384,
      freeSpace: 33_616,
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
    compaction: null,
    providerSections: [],
    ...overrides,
  };
}

function renderText(component: { render(width: number): string[] }): string {
  return component.render(160).join("\n");
}

describe("supi_context tool rendering", () => {
  it("renders a compact tool-call header", () => {
    const output = renderText(renderContextToolCall({}, mockTheme));

    expect(output).toContain("supi_context");
    expect(output).toContain("current session");
  });

  it("renders collapsed summaries from details without leaking raw JSON", () => {
    const details = { analysis: makeAnalysis() } satisfies ContextToolDetails;
    const output = renderText(
      renderContextToolResult(
        {
          content: [{ type: "text", text: '{"raw":"agent-facing-json"}' }],
          details,
        },
        { expanded: false, isPartial: false },
        mockTheme,
      ),
    );

    expect(output).toContain("50.0k / 100.0k");
    expect(output).toContain("33.6k");
    expect(output).toContain("Test Model");
    expect(output).not.toContain("agent-facing-json");
  });

  it("renders expanded reports from structured details", () => {
    const details = { analysis: makeAnalysis() } satisfies ContextToolDetails;
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
    expect(failed).toContain("supi_context failed");
  });
});
