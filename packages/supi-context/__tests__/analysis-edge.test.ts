import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  buildSessionContext: vi.fn(),
  estimateTokens: vi.fn(() => 0),
  getLatestCompactionEntry: vi.fn(),
  getCompactionReserveTokens: vi.fn(() => 16384),
  formatSkillsForPrompt: vi.fn(() => ""),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
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

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { analyzeContext } from "../analysis.ts";

function createMockCtx(overrides?: {
  branch?: ReturnType<ExtensionCommandContext["sessionManager"]["getBranch"]>;
  contextUsage?:
    | { tokens: number | null; contextWindow: number; percent: number | null }
    | undefined;
  systemPrompt?: string;
}): ExtensionCommandContext {
  return {
    cwd: "/project",
    model: { provider: "openai", id: "gpt-4", name: "GPT-4" },
    sessionManager: {
      getBranch: () => overrides?.branch ?? [],
    } as unknown as ExtensionCommandContext["sessionManager"],
    getContextUsage: () => overrides?.contextUsage,
    getSystemPrompt: () => overrides?.systemPrompt ?? "System",
    ui: {
      theme: {
        fg: (_c: string, t: string) => t,
      } as unknown as ExtensionCommandContext["ui"]["theme"],
    } as unknown as ExtensionCommandContext["ui"],
  } as ExtensionCommandContext;
}

function createMockPi(): ExtensionAPI {
  return {
    getActiveTools: () => [],
    getAllTools: () => [],
  } as unknown as ExtensionAPI;
}

describe("analyzeContext edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFns.buildSessionContext.mockReturnValue({ messages: [] });
    mockFns.getLatestCompactionEntry.mockReturnValue(null);
  });

  it("shows pending note when tokens is null", () => {
    const ctx = createMockCtx({
      contextUsage: { tokens: null, contextWindow: 8192, percent: null },
      systemPrompt: "",
    });
    const pi = createMockPi();
    const result = analyzeContext(ctx, pi, undefined);

    expect(result.approximationNote).toBe("Token count pending — send a message to refresh");
    expect(result.scaled).toBe(false);
    expect(result.totalTokens).toBe(0);
  });

  it("shows approximate note when getContextUsage returns undefined", () => {
    const ctx = createMockCtx({ contextUsage: undefined, systemPrompt: "" });
    const pi = createMockPi();
    const result = analyzeContext(ctx, pi, undefined);

    expect(result.approximationNote).toBe("Approximate (no usage data available)");
    expect(result.scaled).toBe(false);
  });

  it("handles empty branch", () => {
    const ctx = createMockCtx({
      branch: [],
      contextUsage: { tokens: 0, contextWindow: 8192, percent: 0 },
    });
    const pi = createMockPi();
    const result = analyzeContext(ctx, pi, undefined);

    expect(result.categories.userMessages).toBe(0);
    expect(result.categories.assistantMessages).toBe(0);
    expect(result.categories.toolResults).toBe(0);
    expect(result.totalTokens).toBe(0);
  });

  it("detects compaction and reports summarized turns", () => {
    const branch = [
      {
        type: "message" as const,
        id: "1",
        parentId: null,
        timestamp: "0",
        message: { role: "user" as const, content: "hi", timestamp: 0 },
      },
      {
        type: "message" as const,
        id: "2",
        parentId: "1",
        timestamp: "0",
        message: { role: "assistant" as const, content: "hello", timestamp: 0 },
      },
      {
        type: "message" as const,
        id: "3",
        parentId: "2",
        timestamp: "0",
        message: { role: "user" as const, content: "again", timestamp: 0 },
      },
      {
        type: "message" as const,
        id: "4",
        parentId: "3",
        timestamp: "0",
        message: { role: "assistant" as const, content: "ok", timestamp: 0 },
      },
      {
        type: "compaction" as const,
        id: "5",
        parentId: "4",
        timestamp: "0",
        summary: "summary",
        firstKeptEntryId: "6",
        tokensBefore: 100,
      },
      {
        type: "message" as const,
        id: "6",
        parentId: "5",
        timestamp: "0",
        message: { role: "user" as const, content: "new", timestamp: 0 },
      },
    ] as unknown as import("@mariozechner/pi-coding-agent").SessionEntry[];

    mockFns.buildSessionContext.mockReturnValue({ messages: [] });
    mockFns.getLatestCompactionEntry.mockReturnValue({
      type: "compaction",
      id: "5",
      parentId: "4",
      timestamp: "0",
      summary: "summary",
      firstKeptEntryId: "6",
      tokensBefore: 100,
    });

    const ctx = createMockCtx({
      branch,
      contextUsage: { tokens: 0, contextWindow: 8192, percent: 0 },
    });
    const pi = createMockPi();
    const result = analyzeContext(ctx, pi, undefined);

    expect(result.compaction).not.toBeNull();
    expect(result.compaction?.summarizedTurns).toBe(2); // 4 messages before compaction = 2 turns
  });

  it("handles no model selected", () => {
    const ctx = {
      ...createMockCtx({ contextUsage: undefined }),
      model: undefined,
    } as ExtensionCommandContext;
    const pi = createMockPi();
    const result = analyzeContext(ctx, pi, undefined);

    expect(result.modelName).toBe("No model selected");
    expect(result.contextWindow).toBe(0);
  });
});
