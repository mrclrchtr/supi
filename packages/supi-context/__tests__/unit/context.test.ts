import { readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { DEFAULT_MAX_BYTES } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
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
import type { ContextAnalysis } from "../../src/analysis.ts";
import contextExtension from "../../src/context.ts";

const analysis: ContextAnalysis = {
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
    instructionFiles: [{ path: "/project/CLAUDE.md", tokens: 120, lines: 30, origin: "project" }],
    contextFiles: [{ path: "/home/context.md", tokens: 80, lines: 20, origin: "global" }],
    skills: [{ name: "testing", tokens: 150 }],
    guidelines: 500,
    toolSnippets: 300,
    toolSnippetDetails: [{ name: "read", tokens: 12 }],
    guidelineSources: [{ source: "read", tokens: 25, bulletCount: 2 }],
    appendText: 0,
  },
  injectedFiles: [{ file: "/project/src/main.ts", turn: 3, tokens: 200, lines: 50 }],
  skills: [{ name: "testing", tokens: 150 }],
  guidelines: 500,
  guidelineBullets: ["EXCLUDED_GUIDELINE"],
  guidelineSources: [{ source: "read", tokens: 25, bulletCount: 2 }],
  toolSnippetDetails: [{ name: "read", tokens: 12 }],
  toolDefinitions: {
    count: 1,
    tokens: 600,
    tools: [{ name: "read", tokens: 600, description: "EXCLUDED_DESCRIPTION" }],
  },
  providerSections: [{ id: "telemetry", label: "EXCLUDED_PROVIDER", data: { calls: 2 } }],
};

const focusedAttribution = {
  scaled: analysis.scaled,
  categories: analysis.categories,
  systemPromptBreakdown: analysis.systemPromptBreakdown,
  injectedFiles: analysis.injectedFiles,
  toolDefinitions: { count: 1, tokens: 600, tools: [{ name: "read", tokens: 600 }] },
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

function expectNativeResult(
  pi: ReturnType<typeof createPiMock>,
  result: { content: Array<{ type: string; text: string }>; structuredContent: unknown },
): void {
  const tool = getTool(pi, "context_report") as { outputSchema?: TSchema };
  expect(tool.outputSchema).toBeDefined();
  if (!tool.outputSchema) throw new Error("Expected context_report outputSchema");
  expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
  const roundTripped = JSON.parse(JSON.stringify(result.structuredContent));
  expect(roundTripped).toEqual(result.structuredContent);
  expect(Value.Check(tool.outputSchema, roundTripped)).toBe(true);
  expect(result.content).toEqual([
    { type: "text", text: JSON.stringify(result.structuredContent) },
  ]);
}

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
    const tool = getTool(pi, "context_report");
    expect(tool.description).toContain("concise, constant-shape pressure snapshot");
    expect(tool.description).toContain("full only when diagnostic attribution is needed");
    expect(tool.description).not.toMatch(/2,000 lines|50 KB/i);
    const result = (await tool.execute("tool-call", {}, undefined, undefined, ctx)) as {
      content: Array<{ type: string; text: string }>;
      structuredContent: unknown;
      details: unknown;
    };

    expectNativeResult(pi, result);
    expect(result.structuredContent).toEqual(snapshot);
    expect(result.content[0]?.text).toBe(JSON.stringify(snapshot));
    expect(result.content[0]?.text).not.toContain("\n");
    expect(Object.keys(JSON.parse(result.content[0]?.text ?? "{}"))).toEqual(Object.keys(snapshot));
    expect(result.details).toEqual({ mode: "concise", snapshot });
    expect(mockFns.analyzeContextPressure).toHaveBeenCalledWith(ctx);
    expect(mockFns.analyzeContext).not.toHaveBeenCalled();
  });

  it.each([
    {
      contextWindow: null,
      usagePercent: null,
      headroomTokens: null,
      pressurePercent: null,
      compacted: false,
      approximationNote: "Usage pending after compaction",
    },
    {
      usedTokens: 120_000,
      usagePercent: 120,
      headroomTokens: 0,
      pressurePercent: 143.5,
      approximationNote: "Approximate usage",
    },
  ])(
    "preserves nullable capacity, notes, compaction facts, and pressure beyond 100%: %j",
    async (capacity) => {
      const expected = { ...snapshot, ...capacity };
      mockFns.analyzeContextPressure.mockReturnValue(expected);
      mockFns.analyzeContext.mockReturnValue({ ...analysis, ...expected });
      const pi = createPiMock();
      contextExtension(pi as never);
      for (const mode of ["concise", "full"] as const) {
        const result = (await getTool(pi, "context_report").execute(
          "tool-call",
          { mode },
          undefined,
          undefined,
          makeCtx(),
        )) as { content: Array<{ type: string; text: string }>; structuredContent: unknown };
        expectNativeResult(pi, result);
        expect(result.structuredContent).toEqual(
          mode === "concise" ? expected : { ...expected, attribution: focusedAttribution },
        );
      }
    },
  );

  it.each(["concise", "full"])("keeps %s analysis failures as thrown failures", async (mode) => {
    const failure = new Error("Analysis failed");
    const analyze = mode === "full" ? mockFns.analyzeContext : mockFns.analyzeContextPressure;
    analyze.mockImplementationOnce(() => {
      throw failure;
    });
    const pi = createPiMock();
    contextExtension(pi as never);
    await expect(
      getTool(pi, "context_report").execute("tool-call", { mode }, undefined, undefined, makeCtx()),
    ).rejects.toBe(failure);
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

    await getTool(pi, "context_report").execute("tool-call", {}, undefined, undefined, ctx);

    expect(mockFns.analyzeContextPressure).toHaveBeenCalledWith(ctx);
    expect(pi.entries).toEqual([]);
    expect(pi.messages).toEqual([]);
  });

  it("returns only focused attribution while retaining the human report in full-mode details", async () => {
    const pi = createPiMock();
    contextExtension(pi as never);
    const result = (await getTool(pi, "context_report").execute(
      "tool-call",
      { mode: "full" },
      undefined,
      undefined,
      makeCtx(),
    )) as {
      content: Array<{ type: string; text: string }>;
      structuredContent: unknown;
      details: unknown;
    };

    expectNativeResult(pi, result);
    expect(result.structuredContent).toEqual({ ...snapshot, attribution: focusedAttribution });
    expect(result.content[0]?.text).not.toContain("EXCLUDED_");
    expect(result.details).toEqual({ mode: "full", analysis });
  });

  it("does not spill large excluded descriptions, guideline text, or provider telemetry", async () => {
    const excludedText = "EXCLUDED_".repeat(DEFAULT_MAX_BYTES);
    const largeHumanReport = {
      ...analysis,
      guidelineBullets: [excludedText],
      providerSections: [{ id: "provider", label: "Provider", data: { text: excludedText } }],
      toolDefinitions: {
        ...analysis.toolDefinitions,
        tools: [{ name: "read", tokens: 600, description: excludedText }],
      },
    };
    mockFns.analyzeContext.mockReturnValue(largeHumanReport);
    const pi = createPiMock();
    contextExtension(pi as never);
    const result = (await getTool(pi, "context_report").execute(
      "tool-call",
      { mode: "full" },
      undefined,
      undefined,
      makeCtx(),
    )) as {
      content: Array<{ type: string; text: string }>;
      structuredContent: unknown;
      details: unknown;
    };

    expectNativeResult(pi, result);
    expect(result.structuredContent).toEqual({ ...snapshot, attribution: focusedAttribution });
    expect(result.details).toEqual({ mode: "full", analysis: largeHumanReport });
  });

  it("spills complete focused attribution with snapshot capacity and the exact UTF-8 byte length", async () => {
    const injectedFiles = Array.from({ length: 1000 }, (_, turn) => ({
      file: `/project/資料-${turn}.ts`,
      turn,
      tokens: 123,
      lines: 40,
    }));
    const oversizedAnalysis = { ...analysis, injectedFiles };
    const expected = { ...snapshot, attribution: { ...focusedAttribution, injectedFiles } };
    expect(Buffer.byteLength(JSON.stringify(expected), "utf8")).toBeGreaterThan(DEFAULT_MAX_BYTES);
    mockFns.analyzeContext.mockReturnValue(oversizedAnalysis);
    const pi = createPiMock();
    contextExtension(pi as never);
    const tool = getTool(pi, "context_report");
    const result = (await tool.execute(
      "tool-call",
      { mode: "full" },
      undefined,
      undefined,
      makeCtx(),
    )) as {
      content: Array<{ type: string; text: string }>;
      structuredContent: { attributionFile: { path: string; bytes: number } };
      details: unknown;
    };
    const { path, bytes } = result.structuredContent.attributionFile;
    try {
      expectNativeResult(pi, result);
      expect(result.structuredContent).toEqual({
        ...snapshot,
        attributionFile: { path: expect.any(String), bytes: expect.any(Number) },
      });
      const saved = await readFile(path, "utf8");
      expect(saved).toBe(JSON.stringify(expected));
      expect(saved).not.toContain("EXCLUDED_");
      expect(bytes).toBe(Buffer.byteLength(saved, "utf8"));
      const { outputSchema } = tool as typeof tool & { outputSchema: TSchema };
      expect(Value.Check(outputSchema, JSON.parse(saved))).toBe(true);
      expect(result.details).toEqual({ mode: "full", analysis: oversizedAnalysis });
    } finally {
      await rm(dirname(path), { recursive: true, force: true });
    }
  });
});
