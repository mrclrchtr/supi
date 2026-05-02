import type { Theme } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { ContextAnalysis } from "../analysis.ts";
import { formatContextReport } from "../format.ts";

const mockTheme = {
  fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
} as unknown as Theme;

function makeAnalysis(overrides?: Partial<ContextAnalysis>): ContextAnalysis {
  return {
    modelName: "Test Model",
    contextWindow: 100_000,
    totalTokens: 50_000,
    scaled: true,
    approximationNote: null,
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
      contextFiles: [{ path: "CLAUDE.md", tokens: 3_000 }],
      skills: [{ name: "test-skill", tokens: 1_000 }],
      guidelines: 500,
      toolSnippets: 300,
      appendText: 200,
    },
    injectedFiles: [{ file: "packages/foo/CLAUDE.md", turn: 3, tokens: 1_200 }],
    skills: [{ name: "test-skill", tokens: 1_000 }],
    guidelines: 500,
    toolDefinitions: { count: 5, tokens: 2_500 },
    compaction: null,
    ...overrides,
  };
}

describe("formatContextReport", () => {
  it("renders a grid with model info", () => {
    const analysis = makeAnalysis();
    const lines = formatContextReport(analysis, mockTheme);

    const gridLine = lines.find((l) => l.includes("█") || l.includes("░"));
    expect(gridLine).toBeDefined();

    const modelLine = lines.find((l) => l.includes("Test Model"));
    expect(modelLine).toBeDefined();
  });

  it("renders category breakdown with percentages", () => {
    const analysis = makeAnalysis();
    const lines = formatContextReport(analysis, mockTheme);

    const breakdownHeader = lines.find((l) => l.includes("Usage by category"));
    expect(breakdownHeader).toBeDefined();

    expect(lines.some((l) => l.includes("System prompt"))).toBe(true);
    expect(lines.some((l) => l.includes("User messages"))).toBe(true);
    expect(lines.some((l) => l.includes("Assistant messages"))).toBe(true);
    expect(lines.some((l) => l.includes("Autocompact buffer"))).toBe(true);
    expect(lines.some((l) => l.includes("Free space"))).toBe(true);
    expect(lines.some((l) => l.includes("[warning]●[/warning] Autocompact buffer"))).toBe(true);
  });

  it("renders the autocompact buffer at the end of the grid", () => {
    const analysis = makeAnalysis();
    const lines = formatContextReport(analysis, mockTheme);
    const gridLines = lines.filter((line) => line.includes("█") || line.includes("░")).slice(0, 5);

    expect(gridLines).toHaveLength(5);
    expect(gridLines[4]).toContain("[dim]░[/dim][dim]░[/dim][dim]░[/dim][dim]░[/dim]");
    expect(gridLines[4]).toContain("[warning]░[/warning]");
  });

  it("omits context files section when empty", () => {
    const analysis = makeAnalysis({
      systemPromptBreakdown: { ...makeAnalysis().systemPromptBreakdown, contextFiles: [] },
    });
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("Context Files (system prompt)"))).toBe(false);
  });

  it("shows context files section when present", () => {
    const analysis = makeAnalysis();
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("Context Files (system prompt)"))).toBe(true);
    expect(lines.some((l) => l.includes("CLAUDE.md"))).toBe(true);
  });

  it("omits injected files section when empty", () => {
    const analysis = makeAnalysis({ injectedFiles: [] });
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("injected · supi-claude-md"))).toBe(false);
  });

  it("shows injected files section when present", () => {
    const analysis = makeAnalysis();
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("injected · supi-claude-md"))).toBe(true);
    expect(lines.some((l) => l.includes("packages/foo/CLAUDE.md"))).toBe(true);
    expect(lines.some((l) => l.includes("turn 3"))).toBe(true);
  });

  it("always shows skills section even when empty", () => {
    const analysis = makeAnalysis({ skills: [] });
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("Skills"))).toBe(true);
    expect(lines.some((l) => l.includes("Send a message to see skill details"))).toBe(true);
  });

  it("shows skills with token estimates when present", () => {
    const analysis = makeAnalysis();
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("Skills (1)"))).toBe(true);
    expect(lines.some((l) => l.includes("test-skill"))).toBe(true);
  });

  it("shows guidelines and tool definitions", () => {
    const analysis = makeAnalysis();
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("Guidelines"))).toBe(true);
    expect(lines.some((l) => l.includes("Tool Definitions (5 active)"))).toBe(true);
  });

  it("shows compaction note when applicable", () => {
    const analysis = makeAnalysis({ compaction: { summarizedTurns: 5 } });
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("5 older turns summarized (compaction)"))).toBe(true);
  });

  it("omits compaction note when not applicable", () => {
    const analysis = makeAnalysis({ compaction: null });
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("summarized (compaction)"))).toBe(false);
  });
});
