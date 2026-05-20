import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { ContextAnalysis } from "../../src/analysis.ts";
import { formatContextReport } from "../../src/format.ts";

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
      instructionFiles: [],
      contextFiles: [{ path: "docs/readme.md", tokens: 3_000, lines: 120, origin: "project" }],
      skills: [{ name: "test-skill", tokens: 1_000 }],
      guidelines: 500,
      toolSnippets: 300,
      appendText: 200,
    },
    injectedFiles: [{ file: "packages/foo/CLAUDE.md", turn: 3, tokens: 1_200, lines: 60 }],
    skills: [{ name: "test-skill", tokens: 1_000 }],
    guidelines: 500,
    guidelineBullets: [],
    toolDefinitions: {
      count: 5,
      tokens: 2_500,
      tools: [
        { name: "read", description: "Read files", tokens: 500 },
        { name: "bash", description: "Run commands", tokens: 600 },
        { name: "edit", description: "Edit files", tokens: 700 },
        { name: "write", description: "Write files", tokens: 400 },
        { name: "search", description: "Search code", tokens: 300 },
      ],
    },
    full: false,
    compaction: null,
    providerSections: [],
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

  it("renders a compact usage bar with free space and autocompact buffer", () => {
    const analysis = makeAnalysis();
    const lines = formatContextReport(analysis, mockTheme);
    const barLine = lines.find(
      (line) => line.includes("█") || line.includes("▒") || line.includes("░"),
    );

    expect(barLine).toBeDefined();
    expect(lines.some((line) => line.includes("[warning]▒[/warning] Autocompact buffer"))).toBe(
      true,
    );
    expect(lines.some((line) => line.includes("[dim]░[/dim] Free space"))).toBe(true);
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
    expect(lines.some((l) => l.includes("docs/readme.md"))).toBe(true);
  });

  it("omits instruction files section when empty", () => {
    const analysis = makeAnalysis();
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("Instruction Files"))).toBe(false);
  });

  it("shows instruction files section when present", () => {
    const analysis = makeAnalysis({
      systemPromptBreakdown: {
        ...makeAnalysis().systemPromptBreakdown,
        instructionFiles: [
          { path: "/project/AGENTS.md", tokens: 2_000, lines: 80, origin: "project" },
          { path: "/project/CLAUDE.md", tokens: 1_500, lines: 60, origin: "project" },
        ],
      },
    });
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("Instruction Files"))).toBe(true);
    expect(lines.some((l) => l.includes("AGENTS.md"))).toBe(true);
    expect(lines.some((l) => l.includes("CLAUDE.md"))).toBe(true);
  });

  it("moves CLAUDE.md from context files to instruction files", () => {
    const analysis = makeAnalysis({
      systemPromptBreakdown: {
        ...makeAnalysis().systemPromptBreakdown,
        contextFiles: [{ path: "docs/readme.md", tokens: 500, lines: 20, origin: "project" }],
        instructionFiles: [{ path: "CLAUDE.md", tokens: 1_000, lines: 40, origin: "global" }],
      },
    });
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("Context Files (system prompt)"))).toBe(true);
    expect(lines.some((l) => l.includes("Instruction Files"))).toBe(true);
    expect(lines.some((l) => l.includes("docs/readme.md"))).toBe(true);
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

  it("shows all tools when count is within preview limit", () => {
    const analysis = makeAnalysis();
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("read"))).toBe(true);
    expect(lines.some((l) => l.includes("bash"))).toBe(true);
    expect(lines.some((l) => l.includes("… and"))).toBe(false);
  });

  it("truncates tool descriptions in preview mode", () => {
    const tools = [
      { name: "read", description: "a".repeat(60), tokens: 500 },
      { name: "bash", description: "Run commands", tokens: 600 },
    ];
    const analysis = makeAnalysis({ toolDefinitions: { count: 2, tokens: 1_100, tools } });
    const lines = formatContextReport(analysis, mockTheme);

    const toolHeaderIdx = lines.findIndex((l) => l.includes("Tool Definitions"));
    const toolLines = lines.slice(toolHeaderIdx + 1, toolHeaderIdx + 3);
    const readLine = toolLines.find((l) => l.includes("read"));
    expect(readLine).toBeDefined();
    expect(readLine).toContain("…");
  });

  it("shows 'and N more' hint for tools in preview mode", () => {
    const tools = Array.from({ length: 8 }, (_, i) => ({
      name: `tool-${i + 1}`,
      description: `Description ${i + 1}`,
      tokens: 100,
    }));
    const analysis = makeAnalysis({ toolDefinitions: { count: 8, tokens: 800, tools } });
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("… and 3 more"))).toBe(true);
    expect(lines.some((l) => l.includes("/supi-context full"))).toBe(true);
  });

  it("shows all tools in full mode", () => {
    const tools = Array.from({ length: 8 }, (_, i) => ({
      name: `tool-${i + 1}`,
      description: `Description ${i + 1}`,
      tokens: 100,
    }));
    const analysis = makeAnalysis({
      full: true,
      toolDefinitions: { count: 8, tokens: 800, tools },
    });
    const lines = formatContextReport(analysis, mockTheme);

    for (const tool of tools) {
      expect(lines.some((l) => l.includes(tool.name))).toBe(true);
    }
    expect(lines.some((l) => l.includes("… and"))).toBe(false);
  });

  it("shows guideline bullet count", () => {
    const analysis = makeAnalysis({ guidelineBullets: ["Be helpful", "Use read for files"] });
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("Guidelines (2 bullets)"))).toBe(true);
  });

  it("shows guideline bullets inline in the guidelines section", () => {
    const analysis = makeAnalysis({
      guidelineBullets: ["Be helpful", "Use read for files", "Avoid rm -rf"],
    });
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("Guideline Details"))).toBe(false);
    expect(lines.some((l) => l.includes("Be helpful"))).toBe(true);
    expect(lines.some((l) => l.includes("Use read for files"))).toBe(true);
  });

  it("omits a separate guideline details header when no bullets", () => {
    const analysis = makeAnalysis({ guidelineBullets: [] });
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("Guideline Details"))).toBe(false);
  });

  it("truncates guideline bullets in preview mode", () => {
    const longBullet = "a".repeat(120);
    const analysis = makeAnalysis({ guidelineBullets: [longBullet] });
    const lines = formatContextReport(analysis, mockTheme);

    const detailLine = lines.find((l) => l.includes("a".repeat(80)));
    expect(detailLine).toBeDefined();
    expect(detailLine).toContain("…");
  });

  it("shows 'and N more' hint in preview mode", () => {
    const bullets = Array.from({ length: 10 }, (_, i) => `Bullet ${i + 1}`);
    const analysis = makeAnalysis({ guidelineBullets: bullets });
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("… and 4 more"))).toBe(true);
    expect(lines.some((l) => l.includes("/supi-context full"))).toBe(true);
  });

  it("shows all guideline bullets in full mode", () => {
    const bullets = Array.from({ length: 10 }, (_, i) => `Bullet ${i + 1}`);
    const analysis = makeAnalysis({ full: true, guidelineBullets: bullets });
    const lines = formatContextReport(analysis, mockTheme);

    for (const bullet of bullets) {
      expect(lines.some((l) => l.includes(bullet))).toBe(true);
    }
    expect(lines.some((l) => l.includes("… and"))).toBe(false);
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

  it("omits provider sections when empty", () => {
    const analysis = makeAnalysis();
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("RTK"))).toBe(false);
  });

  it("renders provider sections when present", () => {
    const analysis = makeAnalysis({
      providerSections: [{ id: "rtk", label: "RTK", data: { rewrites: 5, fallbacks: 1 } }],
    });
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("RTK"))).toBe(true);
    expect(lines.some((l) => l.includes("[text]rewrites[/text]"))).toBe(true);
    expect(lines.some((l) => l.includes("[text]fallbacks[/text]"))).toBe(true);
  });

  it("renders multiple provider sections", () => {
    const analysis = makeAnalysis({
      providerSections: [
        { id: "rtk", label: "RTK", data: { rewrites: 5 } },
        { id: "cache", label: "Cache", data: { hits: 10 } },
      ],
    });
    const lines = formatContextReport(analysis, mockTheme);

    expect(lines.some((l) => l.includes("RTK"))).toBe(true);
    expect(lines.some((l) => l.includes("Cache"))).toBe(true);
  });
});
