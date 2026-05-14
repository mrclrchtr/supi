import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  buildSessionContext: vi.fn(),
  estimateTokens: vi.fn(() => 0),
  getLatestCompactionEntry: vi.fn(),
  getCompactionReserveTokens: vi.fn(() => 16384),
  formatSkillsForPrompt: vi.fn(() => ""),
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

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { analyzeContext } from "../src/analysis.ts";

describe("analyzeContext edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFns.buildSessionContext.mockReturnValue({ messages: [] });
    mockFns.getLatestCompactionEntry.mockReturnValue(null);
  });

  it("shows pending note when tokens is null", () => {
    const ctx = makeCtx({
      getContextUsage: () => ({ tokens: null, contextWindow: 8192, percent: null }),
      getSystemPrompt: () => "",
    });
    const pi = createPiMock();
    const result = analyzeContext(ctx as never, pi as never, undefined);

    expect(result.approximationNote).toBe("Token count pending — send a message to refresh");
    expect(result.scaled).toBe(false);
    expect(result.totalTokens).toBe(0);
  });

  it("shows approximate note when getContextUsage returns undefined", () => {
    const ctx = makeCtx({
      getContextUsage: () => undefined,
      getSystemPrompt: () => "",
    });
    const pi = createPiMock();
    const result = analyzeContext(ctx as never, pi as never, undefined);

    expect(result.approximationNote).toBe("Approximate (no usage data available)");
    expect(result.scaled).toBe(false);
  });

  it("handles empty branch", () => {
    const ctx = makeCtx({
      sessionManager: { getBranch: vi.fn(() => []) },
      getContextUsage: () => ({ tokens: 0, contextWindow: 8192, percent: 0 }),
      getSystemPrompt: () => "",
    });
    const pi = createPiMock();
    const result = analyzeContext(ctx as never, pi as never, undefined);

    expect(result.categories.userMessages).toBe(0);
    expect(result.categories.assistantMessages).toBe(0);
    expect(result.categories.toolResults).toBe(0);
    expect(result.totalTokens).toBe(0);
  });

  it("keeps raw estimates when usage tokens is zero", () => {
    const ctx = makeCtx({
      getContextUsage: () => ({ tokens: 0, contextWindow: 8192, percent: 0 }),
      getSystemPrompt: () => "S".repeat(400),
    });
    const pi = createPiMock();
    const result = analyzeContext(ctx as never, pi as never, undefined);

    expect(result.scaled).toBe(false);
    expect(result.approximationNote).toBe("Token count pending — send a message to refresh");
    expect(result.categories.systemPrompt).toBe(100);
    expect(result.totalTokens).toBe(100);
  });

  it("derives skills and context files from the current system prompt", () => {
    const dir = mkdtempSync(join(tmpdir(), "supi-context-"));
    const agentsPath = join(dir, "AGENTS.md");
    writeFileSync(agentsPath, "A".repeat(120));

    try {
      const ctx = makeCtx({
        getContextUsage: () => ({ tokens: 0, contextWindow: 8192, percent: 0 }),
        getSystemPrompt: () =>
          [
            "Base prompt",
            "",
            "Guidelines:",
            "- Use bash for file operations like ls, rg, find",
            "- Be concise in your responses",
            "",
            "# Project Context",
            "",
            "Project-specific instructions and guidelines:",
            "",
            `## ${agentsPath}`,
            "",
            "placeholder",
            "",
            "The following skills provide specialized instructions for specific tasks.",
            "Use the read tool to load a skill's file when the task matches its description.",
            "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
            "",
            "<available_skills>",
            "  <skill>",
            "    <name>find-docs</name>",
            "    <description>Find docs</description>",
            "    <location>/tmp/find-docs/SKILL.md</location>",
            "  </skill>",
            "</available_skills>",
            "Current date: 2026-04-27",
            `Current working directory: ${dir}`,
          ].join("\n"),
      });
      const pi = createPiMock();
      const result = analyzeContext(ctx as never, pi as never, undefined);

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe("find-docs");
      expect(result.guidelines).toBeGreaterThan(0);
      expect(result.systemPromptBreakdown.contextFiles).toHaveLength(1);
      expect(result.systemPromptBreakdown.contextFiles[0].path).toBe(agentsPath);
      expect(result.systemPromptBreakdown.contextFiles[0].tokens).toBe(30);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
    ] as unknown as import("@earendil-works/pi-coding-agent").SessionEntry[];

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

    const ctx = makeCtx({
      sessionManager: { getBranch: vi.fn(() => branch) },
      getContextUsage: () => ({ tokens: 0, contextWindow: 8192, percent: 0 }),
    });
    const pi = createPiMock();
    const result = analyzeContext(ctx as never, pi as never, undefined);

    expect(result.compaction).not.toBeNull();
    expect(result.compaction?.summarizedTurns).toBe(2); // 4 messages before compaction = 2 turns
  });

  it("handles no model selected", () => {
    const ctx = {
      ...makeCtx({ getContextUsage: () => undefined }),
      model: undefined,
    } as unknown as ExtensionCommandContext;
    const pi = createPiMock();
    const result = analyzeContext(ctx as never, pi as never, undefined);

    expect(result.modelName).toBe("No model selected");
    expect(result.contextWindow).toBe(0);
  });
});
