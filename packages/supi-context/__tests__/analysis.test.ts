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

vi.mock("@mrclrchtr/supi-core", () => ({
  createInputSubmenu: vi.fn(),
  getRegisteredContextProviders: mockFns.getRegisteredContextProviders,
}));

import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { analyzeContext } from "../src/analysis.ts";

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
    const result = analyzeContext(ctx, pi, cachedOptions);

    expect(result.systemPromptBreakdown.contextFiles).toHaveLength(1);
    expect(result.systemPromptBreakdown.contextFiles[0].path).toBe("AGENTS.md");
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
        id: "rtk",
        label: "RTK",
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
      id: "rtk",
      label: "RTK",
      data: { rewrites: 5, fallbacks: 1 },
    });
  });

  it("omits providers that return null", () => {
    mockFns.buildSessionContext.mockReturnValue({ messages: [] });
    mockFns.getRegisteredContextProviders.mockReturnValue([
      {
        id: "rtk",
        label: "RTK",
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
});
