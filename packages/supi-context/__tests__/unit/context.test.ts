import { readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  analyzeContext: vi.fn(),
  analyzeContextPressure: vi.fn(),
  loadContextConfig: vi.fn(() => ({ agentToolEnabled: true })),
  registerContextSettings: vi.fn(),
}));

vi.mock("../../src/analysis.ts", () => ({
  analyzeContext: mockFns.analyzeContext,
  analyzeContextPressure: mockFns.analyzeContextPressure,
}));

vi.mock("../../src/config.ts", () => ({
  loadContextConfig: mockFns.loadContextConfig,
}));

vi.mock("../../src/settings-registration.ts", () => ({
  registerContextSettings: mockFns.registerContextSettings,
}));

import { createPiMock, getHandlerOrThrow, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import contextExtension from "../../src/context.ts";

const analysis = {
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
    toolSnippetDetails: [],
    guidelineSources: [],
    appendText: 0,
  },
  injectedFiles: [],
  skills: [],
  guidelines: 500,
  guidelineBullets: [],
  guidelineSources: [],
  toolSnippetDetails: [],
  toolDefinitions: { count: 0, tokens: 0, tools: [] },
  providerSections: [],
};

const snapshot = {
  modelName: analysis.modelName,
  contextWindow: analysis.contextWindow,
  usedTokens: analysis.usedTokens,
  usagePercent: analysis.usagePercent,
  compactionEnabled: analysis.compactionEnabled,
  reserveTokens: analysis.reserveTokens,
  headroomTokens: analysis.headroomTokens,
  pressurePercent: analysis.pressurePercent,
  compacted: analysis.compacted,
  approximationNote: analysis.approximationNote,
};

function commandHandler(
  pi: ReturnType<typeof createPiMock>,
): (args: string, ctx: unknown) => Promise<void> {
  const handler = pi.getCommandHandler("supi-context");
  if (typeof handler !== "function") {
    throw new Error("Expected /supi-context to be registered");
  }
  return handler as (args: string, ctx: unknown) => Promise<void>;
}

describe("supi-context extension surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFns.loadContextConfig.mockReturnValue({ agentToolEnabled: true });
    mockFns.analyzeContext.mockReturnValue(analysis);
    mockFns.analyzeContextPressure.mockReturnValue(snapshot);
  });

  it("registers the human command only for TUI sessions and appends a TUI-only entry", async () => {
    const entryAnalysis = {
      ...analysis,
      guidelineBullets: Array.from({ length: 10 }, (_, index) => `Bullet ${index + 1}`),
      toolDefinitions: {
        count: 8,
        tokens: 800,
        tools: Array.from({ length: 8 }, (_, index) => ({
          name: `tool-${index + 1}`,
          description: `Tool ${index + 1}`,
          tokens: 100,
        })),
      },
    };
    mockFns.analyzeContext.mockReturnValue(entryAnalysis);
    const pi = createPiMock();
    contextExtension(pi as never);

    expect(pi.commands.has("supi-context")).toBe(false);
    expect(pi.entryRenderers.has("supi-context")).toBe(true);
    expect(pi.registerMessageRenderer).not.toHaveBeenCalled();

    const sessionStart = getHandlerOrThrow(pi, "session_start");
    await sessionStart({}, { ...makeCtx(), mode: "print" });
    expect(pi.commands.has("supi-context")).toBe(false);

    const tuiCtx = { ...makeCtx(), mode: "tui" };
    await sessionStart({}, tuiCtx);
    await commandHandler(pi)("", tuiCtx);
    await commandHandler(pi)("full", tuiCtx);

    expect(pi.entries).toEqual([
      { type: "supi-context", data: { mode: "preview", analysis: entryAnalysis } },
      { type: "supi-context", data: { mode: "full", analysis: entryAnalysis } },
    ]);
    const renderer = pi.entryRenderers.get("supi-context");
    if (typeof renderer !== "function") throw new Error("Expected a supi-context entry renderer");
    const plainTheme = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
    };
    const preview = (
      renderer({ data: pi.entries[0]?.data }, { expanded: true }, plainTheme) as {
        render(width: number): string[];
      }
    )
      .render(200)
      .join("\n");
    const full = (
      renderer({ data: pi.entries[1]?.data }, { expanded: true }, plainTheme) as {
        render(width: number): string[];
      }
    )
      .render(200)
      .join("\n");

    expect(preview).not.toContain("tool-8");
    expect(preview).not.toContain("Bullet 10");
    expect(full).toContain("tool-8");
    expect(full).toContain("Bullet 10");
    expect(pi.messages).toEqual([]);
  });

  it("keeps the existing agent-tool configuration gate", () => {
    mockFns.loadContextConfig.mockReturnValue({ agentToolEnabled: false });
    const pi = createPiMock();

    contextExtension(pi as never);

    expect(pi.tools).toEqual([]);
  });

  it("returns a one-line, constant-shape concise snapshot by default", async () => {
    const pi = createPiMock();
    contextExtension(pi as never);
    const ctx = { ...makeCtx(), mode: "tui" };
    const tool = getTool(pi, "supi_context");
    expect(tool.description).toContain(`${DEFAULT_MAX_LINES} lines`);
    expect(tool.description).toContain(formatSize(DEFAULT_MAX_BYTES));
    const result = (await tool.execute("tool-call", {}, undefined, undefined, ctx)) as {
      content: Array<{ type: string; text: string }>;
      details: unknown;
    };

    expect(result.content[0]?.text).toBe(JSON.stringify(snapshot));
    expect(result.content[0]?.text).not.toContain("\n");
    expect(Object.keys(JSON.parse(result.content[0]?.text ?? "{}"))).toEqual(Object.keys(snapshot));
    expect(result.details).toEqual({ mode: "concise", snapshot });
    expect(mockFns.analyzeContextPressure).toHaveBeenCalledWith(ctx);
    expect(mockFns.analyzeContext).not.toHaveBeenCalled();
  });

  it("takes the snapshot before its own tool result changes session state", async () => {
    const branch = [{ type: "message", id: "existing-result" }];
    const pi = createPiMock();
    contextExtension(pi as never);
    const ctx = {
      ...makeCtx(),
      mode: "tui",
      sessionManager: { getBranch: vi.fn(() => branch) },
    };
    mockFns.analyzeContextPressure.mockImplementation((observedCtx: typeof ctx) => {
      expect(observedCtx.sessionManager.getBranch()).toEqual(branch);
      return snapshot;
    });

    await getTool(pi, "supi_context").execute("tool-call", {}, undefined, undefined, ctx);

    expect(mockFns.analyzeContextPressure).toHaveBeenCalledWith(ctx);
    expect(pi.entries).toEqual([]);
    expect(pi.messages).toEqual([]);
  });

  it("returns compact diagnostic JSON only when full mode is requested", async () => {
    const pi = createPiMock();
    contextExtension(pi as never);
    const ctx = { ...makeCtx(), mode: "tui" };
    const tool = getTool(pi, "supi_context");
    const result = (await tool.execute(
      "tool-call",
      { mode: "full" },
      undefined,
      undefined,
      ctx,
    )) as {
      content: Array<{ type: string; text: string }>;
      details: unknown;
    };

    expect(result.content[0]?.text).toBe(JSON.stringify(analysis));
    expect(result.content[0]?.text).not.toContain("\n");
    expect(result.details).toEqual({ mode: "full", analysis });
  });

  it("returns a valid JSON envelope and preserves oversized full output in a temp file", async () => {
    const oversizedAnalysis = {
      ...analysis,
      toolDefinitions: {
        count: 1,
        tokens: DEFAULT_MAX_BYTES,
        tools: [
          { name: "large", description: "x".repeat(DEFAULT_MAX_BYTES), tokens: DEFAULT_MAX_BYTES },
        ],
      },
    };
    mockFns.analyzeContext.mockReturnValue(oversizedAnalysis);
    const pi = createPiMock();
    contextExtension(pi as never);
    const ctx = { ...makeCtx(), mode: "tui" };
    const tool = getTool(pi, "supi_context");
    const result = (await tool.execute(
      "tool-call",
      { mode: "full" },
      undefined,
      undefined,
      ctx,
    )) as {
      content: Array<{ type: string; text: string }>;
    };
    const envelope = JSON.parse(result.content[0]?.text ?? "{}") as {
      truncated?: boolean;
      fullOutputPath?: string;
      totalLines?: number;
      totalBytes?: number;
      maxLines?: number;
      maxBytes?: number;
    };

    expect(envelope).toMatchObject({
      truncated: true,
      fullOutputPath: expect.any(String),
      totalLines: expect.any(Number),
      totalBytes: expect.any(Number),
      maxLines: DEFAULT_MAX_LINES,
      maxBytes: DEFAULT_MAX_BYTES,
    });

    const fullOutputPath = envelope.fullOutputPath;
    if (!fullOutputPath) throw new Error("Expected a full output path");
    try {
      expect(JSON.parse(await readFile(fullOutputPath, "utf8"))).toEqual(oversizedAnalysis);
    } finally {
      await rm(dirname(fullOutputPath), { recursive: true, force: true });
    }
  });
});
