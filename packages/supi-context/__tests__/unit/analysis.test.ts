import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  buildSessionContext: vi.fn(),
  estimateTokens: vi.fn(),
  getLatestCompactionEntry: vi.fn(),
  getCompactionReserveTokens: vi.fn(() => 16384),
  formatSkillsForPrompt: vi.fn((skills: Array<{ name: string }>) =>
    skills.map((s) => `<skill>${s.name}</skill>`).join("\n"),
  ),
  getRegisteredContextProviders: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  buildSessionContext: mockFns.buildSessionContext,
  estimateTokens: mockFns.estimateTokens,
  getLatestCompactionEntry: mockFns.getLatestCompactionEntry,
  SettingsManager: {
    create: () => ({
      getCompactionReserveTokens: mockFns.getCompactionReserveTokens,
    }),
  },
  formatSkillsForPrompt: mockFns.formatSkillsForPrompt,
}));

vi.mock("@mrclrchtr/supi-core/context", () => ({
  getRegisteredContextProviders: mockFns.getRegisteredContextProviders,
}));

import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { analyzeContext } from "../../src/analysis.ts";

function createMockMessage(
  role: "user" | "assistant" | "toolResult",
  content: string,
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>,
) {
  if (role === "assistant") {
    const msgContent: Array<{
      type: string;
      text?: string;
      thinking?: string;
      name?: string;
      arguments?: Record<string, unknown>;
    }> = [{ type: "text", text: content }];
    if (toolCalls) {
      for (const tc of toolCalls) {
        msgContent.push({ type: "toolCall", name: tc.name, arguments: tc.arguments });
      }
    }
    return {
      role,
      content: msgContent,
      api: "openai",
      provider: "openai",
      model: "gpt-4",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: 0,
    } as unknown;
  }
  return { role, content: [{ type: "text", text: content }], timestamp: 0 } as unknown;
}

describe("analyzeContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFns.buildSessionContext.mockReturnValue({ messages: [] });
    mockFns.estimateTokens.mockImplementation((msg: { role: string; content: unknown }) => {
      const contentStr = JSON.stringify(msg.content);
      return Math.ceil(contentStr.length / 4);
    });
    mockFns.getLatestCompactionEntry.mockReturnValue(null);
    mockFns.getRegisteredContextProviders.mockReturnValue([]);
  });

  it("builds API view from branch entries", () => {
    const branch = [
      {
        type: "message" as const,
        id: "1",
        parentId: null,
        timestamp: "0",
        message: createMockMessage("user", "Hello"),
      },
    ] as unknown as import("@earendil-works/pi-coding-agent").SessionEntry[];
    mockFns.buildSessionContext.mockReturnValue({ messages: [createMockMessage("user", "Hello")] });

    const ctx = makeCtx({ sessionManager: { getBranch: vi.fn(() => branch) } });
    const pi = createPiMock();
    analyzeContext(ctx as never, pi as never, undefined);

    expect(mockFns.buildSessionContext).toHaveBeenCalledWith(branch);
  });

  it("buckets tokens by category", () => {
    const messages = [
      createMockMessage("user", "User msg"),
      createMockMessage("assistant", "Assistant reply"),
      createMockMessage("toolResult", "Tool output"),
    ];
    mockFns.buildSessionContext.mockReturnValue({ messages });

    const ctx = makeCtx({
      getContextUsage: () => ({ tokens: null, contextWindow: 8192, percent: null }),
    });
    const pi = createPiMock();
    const result = analyzeContext(ctx as never, pi as never, undefined);

    expect(result.categories.userMessages).toBeGreaterThan(0);
    expect(result.categories.assistantMessages).toBeGreaterThan(0);
    expect(result.categories.toolResults).toBeGreaterThan(0);
  });

  it("separates tool calls from assistant text", () => {
    const messages = [
      createMockMessage("assistant", "Thinking...", [
        { name: "read", arguments: { path: "/file" } },
      ]),
    ];
    mockFns.buildSessionContext.mockReturnValue({ messages });

    const ctx = makeCtx({
      getContextUsage: () => ({ tokens: null, contextWindow: 8192, percent: null }),
    });
    const pi = createPiMock();
    const result = analyzeContext(ctx as never, pi as never, undefined);

    expect(result.categories.assistantMessages).toBeGreaterThan(0);
    expect(result.categories.toolCalls).toBeGreaterThan(0);
  });

  it("scales estimates to actual token total", () => {
    const messages = [
      createMockMessage("user", "A".repeat(400)),
      createMockMessage("assistant", "B".repeat(400)),
    ];
    mockFns.buildSessionContext.mockReturnValue({ messages });
    // estimateTokens will return ~100 each = 200 raw total
    // actual tokens = 400, so scale factor = 2

    const ctx = makeCtx({
      getContextUsage: () => ({ tokens: 400, contextWindow: 8192, percent: 4.9 }),
      getSystemPrompt: () => "",
    });
    const pi = createPiMock();
    const result = analyzeContext(ctx as never, pi as never, undefined);

    expect(result.scaled).toBe(true);
    expect(result.categories.userMessages).toBe(200);
    expect(result.categories.assistantMessages).toBe(200);
    expect(result.totalTokens).toBe(400);
  });

  it("computes system prompt breakdown from cached options", () => {
    mockFns.buildSessionContext.mockReturnValue({ messages: [] });
    mockFns.formatSkillsForPrompt.mockReturnValue("<skill>test-skill</skill>");

    const cachedOptions = {
      cwd: "/project",
      contextFiles: [{ path: "AGENTS.md", content: "A".repeat(120) }],
      skills: [
        { name: "test-skill", description: "A test skill", location: "/skill.md" },
      ] as unknown as import("@earendil-works/pi-coding-agent").Skill[],
      promptGuidelines: ["Be helpful"],
      toolSnippets: { read: "Read files" },
      appendSystemPrompt: "Append this",
    };

    const ctx = makeCtx({
      getContextUsage: () => ({ tokens: null, contextWindow: 8192, percent: null }),
      getSystemPrompt: () => "S".repeat(400),
    });
    const pi = createPiMock();
    const result = analyzeContext(ctx as never, pi as never, cachedOptions);

    expect(result.systemPromptBreakdown.instructionFiles).toHaveLength(1);
    expect(result.systemPromptBreakdown.instructionFiles[0].path).toBe("AGENTS.md");
    expect(result.systemPromptBreakdown.contextFiles).toHaveLength(0);
    expect(result.systemPromptBreakdown.skills).toHaveLength(1);
    expect(result.systemPromptBreakdown.skills[0].name).toBe("test-skill");
    expect(result.systemPromptBreakdown.guidelines).toBeGreaterThan(0);
    expect(result.systemPromptBreakdown.toolSnippets).toBeGreaterThan(0);
    expect(result.systemPromptBreakdown.appendText).toBeGreaterThan(0);
    expect(result.systemPromptBreakdown.base).toBeGreaterThanOrEqual(0);
  });

  it("counts active tool definitions", () => {
    mockFns.buildSessionContext.mockReturnValue({ messages: [] });

    const ctx = makeCtx({
      getContextUsage: () => ({ tokens: null, contextWindow: 8192, percent: null }),
    });
    const pi = createPiMock();
    pi.registerTool({ name: "read", description: "Read", parameters: { type: "object" } });
    pi.registerTool({ name: "bash", description: "Bash", parameters: { type: "object" } });
    pi.setActiveTools(["read"]);
    const result = analyzeContext(ctx as never, pi as never, undefined);

    expect(result.toolDefinitions.count).toBe(1);
    expect(result.toolDefinitions.tokens).toBeGreaterThan(0);
  });

  it("includes provider sections from registered context providers", () => {
    mockFns.buildSessionContext.mockReturnValue({ messages: [] });
    mockFns.getRegisteredContextProviders.mockReturnValue([
      {
        id: "lsp",
        label: "LSP",
        getData: () => ({ rewrites: 5, fallbacks: 1 }),
      },
    ]);

    const ctx = makeCtx({
      getContextUsage: () => ({ tokens: null, contextWindow: 8192, percent: null }),
    });
    const pi = createPiMock();
    const result = analyzeContext(ctx as never, pi as never, undefined);

    expect(result.providerSections).toHaveLength(1);
    expect(result.providerSections[0]).toMatchObject({
      id: "lsp",
      label: "LSP",
      data: { rewrites: 5, fallbacks: 1 },
    });
  });

  it("omits providers that return null", () => {
    mockFns.buildSessionContext.mockReturnValue({ messages: [] });
    mockFns.getRegisteredContextProviders.mockReturnValue([
      {
        id: "lsp",
        label: "LSP",
        getData: () => null,
      },
    ]);

    const ctx = makeCtx({
      getContextUsage: () => ({ tokens: null, contextWindow: 8192, percent: null }),
    });
    const pi = createPiMock();
    const result = analyzeContext(ctx as never, pi as never, undefined);

    expect(result.providerSections).toHaveLength(0);
  });

  it("populates toolSnippetDetails from cached toolsnippets", () => {
    mockFns.buildSessionContext.mockReturnValue({ messages: [] });

    const cachedOptions = {
      cwd: "/project",
      toolSnippets: { read: "Read files", bash: "Run commands" },
      promptGuidelines: [],
    };

    const ctx = makeCtx({
      getContextUsage: () => ({ tokens: null, contextWindow: 8192, percent: null }),
      getSystemPrompt: () => "Guidelines:\n- Be concise\n",
    });
    const pi = createPiMock();
    const result = analyzeContext(ctx as never, pi as never, cachedOptions);

    expect(result.toolSnippetDetails).toHaveLength(2);
    expect(result.toolSnippetDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "read", tokens: expect.any(Number) }),
        expect.objectContaining({ name: "bash", tokens: expect.any(Number) }),
      ]),
    );
  });

  it("classifies guidelines into source buckets from system prompt", () => {
    mockFns.buildSessionContext.mockReturnValue({ messages: [] });

    const ctx = makeCtx({
      getContextUsage: () => ({ tokens: null, contextWindow: 8192, percent: null }),
      getSystemPrompt: () =>
        [
          "Base prompt",
          "",
          "Guidelines:",
          "- Be concise in your responses",
          "- Use read to examine files instead of cat or sed.",
          "- Show file paths clearly when working with files",
          "- Some custom guideline from an extension",
        ].join("\n"),
    });
    const pi = createPiMock();
    const result = analyzeContext(ctx as never, pi as never, undefined);

    expect(result.guidelineSources).toHaveLength(3);

    const defaultSource = result.guidelineSources.find((s) => s.source === "default");
    expect(defaultSource).toBeDefined();
    expect(defaultSource?.bulletCount).toBe(2);

    const readSource = result.guidelineSources.find((s) => s.source === "read");
    expect(readSource).toBeDefined();
    expect(readSource?.bulletCount).toBe(1);

    const otherSource = result.guidelineSources.find((s) => s.source === "other");
    expect(otherSource).toBeDefined();
    expect(otherSource?.bulletCount).toBe(1);
  });

  it("returns empty guidelineSources when no guidelines in system prompt", () => {
    mockFns.buildSessionContext.mockReturnValue({ messages: [] });

    const ctx = makeCtx({
      getContextUsage: () => ({ tokens: null, contextWindow: 8192, percent: null }),
      getSystemPrompt: () => "Just a base prompt without guidelines section",
    });
    const pi = createPiMock();
    const result = analyzeContext(ctx as never, pi as never, undefined);

    expect(result.guidelineSources).toEqual([]);
  });

  it("returns empty toolSnippetDetails when no toolsnippets in cached options", () => {
    mockFns.buildSessionContext.mockReturnValue({ messages: [] });

    const ctx = makeCtx({
      getContextUsage: () => ({ tokens: null, contextWindow: 8192, percent: null }),
      getSystemPrompt: () => "",
    });
    const pi = createPiMock();
    const result = analyzeContext(ctx as never, pi as never, undefined);

    expect(result.toolSnippetDetails).toEqual([]);
  });
});
