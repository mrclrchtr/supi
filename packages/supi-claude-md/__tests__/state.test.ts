import type { SessionEntry } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { reconstructState } from "../state.ts";

function makeAssistantEntry(
  stopReason: "stop" | "toolUse" = "stop",
  content: Array<{ type: "text"; text: string }> = [],
): SessionEntry {
  return {
    type: "message",
    id: `assistant-${Math.random()}`,
    parentId: null,
    timestamp: new Date().toISOString(),
    message: {
      role: "assistant",
      content,
      api: "anthropic",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason,
      timestamp: Date.now(),
    },
  };
}

function makeUserEntry(text: string = "hello"): SessionEntry {
  return {
    type: "message",
    id: `user-${Math.random()}`,
    parentId: null,
    timestamp: new Date().toISOString(),
    message: {
      role: "user",
      content: text,
      timestamp: Date.now(),
    },
  };
}

function makeToolResultEntry(text: string): SessionEntry {
  return {
    type: "message",
    id: `tool-${Math.random()}`,
    parentId: null,
    timestamp: new Date().toISOString(),
    message: {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "read",
      content: [{ type: "text", text }],
      isError: false,
      timestamp: Date.now(),
    },
  };
}

function makeRefreshEntry(turn: number, contextToken?: string): SessionEntry {
  return {
    type: "custom_message",
    id: `refresh-${Math.random()}`,
    parentId: null,
    timestamp: new Date().toISOString(),
    customType: "supi-claude-md-refresh",
    content: "refresh",
    display: true,
    details: { turn, contextToken },
  };
}

describe("reconstructState", () => {
  it("returns zeros for empty branch", () => {
    const result = reconstructState([]);
    expect(result.completedTurns).toBe(0);
    expect(result.lastRefreshTurn).toBe(0);
    expect(result.injectedDirs.size).toBe(0);
    expect(result.contextCounter).toBe(0);
  });

  it("counts completed assistant turns from session message entries", () => {
    const branch = [
      makeUserEntry(),
      makeAssistantEntry("stop"),
      makeUserEntry(),
      makeAssistantEntry("toolUse"),
      makeToolResultEntry("ignored"),
      makeAssistantEntry("stop"),
    ];

    const result = reconstructState(branch);
    expect(result.completedTurns).toBe(2);
  });

  it("finds last refresh turn from custom message entries", () => {
    const branch = [
      makeRefreshEntry(3, "supi-claude-md-1"),
      makeUserEntry(),
      makeRefreshEntry(6, "supi-claude-md-2"),
    ];

    const result = reconstructState(branch);
    expect(result.lastRefreshTurn).toBe(6);
  });

  it("tracks the highest refresh token counter", () => {
    const branch = [
      makeRefreshEntry(3, "supi-claude-md-2"),
      makeRefreshEntry(6, "supi-claude-md-8"),
    ];

    const result = reconstructState(branch);
    expect(result.contextCounter).toBe(8);
  });

  it("extracts injected dirs from tool result tags", () => {
    const branch = [
      makeToolResultEntry(
        // biome-ignore lint/security/noSecrets: XML tag fixture in test, not a secret
        'file contents here\n<extension-context source="supi-claude-md" file="packages/foo/CLAUDE.md" turn="5">\ncontext\n</extension-context>',
      ),
    ];

    const result = reconstructState(branch);
    expect(result.injectedDirs.size).toBe(1);
    expect(result.injectedDirs.get("packages/foo")).toEqual({
      turn: 5,
      file: "packages/foo/CLAUDE.md",
    });
  });

  it("handles multiple injected dirs in a single tool result", () => {
    const branch = [
      makeToolResultEntry(
        // biome-ignore lint/security/noSecrets: XML tag fixture in test, not a secret
        '<extension-context source="supi-claude-md" file="packages/foo/CLAUDE.md" turn="3">\nfoo\n</extension-context>\n\n<extension-context source="supi-claude-md" file="packages/bar/CLAUDE.md" turn="3">\nbar\n</extension-context>',
      ),
    ];

    const result = reconstructState(branch);
    expect(result.injectedDirs.size).toBe(2);
    expect(result.injectedDirs.has("packages/foo")).toBe(true);
    expect(result.injectedDirs.has("packages/bar")).toBe(true);
  });

  it("ignores tags from other extensions", () => {
    const branch = [
      makeToolResultEntry(
        '<extension-context source="supi-lsp" file="foo.ts">\ndiagnostics\n</extension-context>',
      ),
    ];

    const result = reconstructState(branch);
    expect(result.injectedDirs.size).toBe(0);
  });

  it("handles mixed branch with all relevant entry types", () => {
    const branch = [
      makeUserEntry(),
      makeAssistantEntry("stop"),
      makeToolResultEntry(
        '<extension-context source="supi-claude-md" file="pkg/a/CLAUDE.md" turn="1">\na\n</extension-context>',
      ),
      makeAssistantEntry("stop"),
      makeRefreshEntry(2, "supi-claude-md-4"),
      makeAssistantEntry("stop"),
    ];

    const result = reconstructState(branch);
    expect(result.completedTurns).toBe(3);
    expect(result.lastRefreshTurn).toBe(2);
    expect(result.injectedDirs.size).toBe(1);
    expect(result.contextCounter).toBe(4);
  });

  it("handles missing or non-text tool result content gracefully", () => {
    const branch: SessionEntry[] = [
      {
        type: "message",
        id: "tool-empty",
        parentId: null,
        timestamp: new Date().toISOString(),
        message: {
          role: "toolResult",
          toolCallId: "call-1",
          toolName: "read",
          content: [],
          isError: false,
          timestamp: Date.now(),
        },
      },
    ];

    const result = reconstructState(branch);
    expect(result.injectedDirs.size).toBe(0);
  });
});
