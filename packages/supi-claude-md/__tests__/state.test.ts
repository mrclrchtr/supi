import { describe, expect, it } from "vitest";
import { reconstructState } from "../state.ts";

describe("reconstructState", () => {
  it("returns zeros for empty branch", () => {
    const result = reconstructState([]);
    expect(result.completedTurns).toBe(0);
    expect(result.lastRefreshTurn).toBe(0);
    expect(result.injectedDirs.size).toBe(0);
  });

  it("counts completed assistant turns", () => {
    const branch = [
      { type: "user", role: "user" },
      { type: "assistant", role: "assistant", stopReason: "stop" },
      { type: "user", role: "user" },
      { type: "assistant", role: "assistant", stopReason: "tool_use" },
      { type: "toolResult", role: "tool" },
      { type: "assistant", role: "assistant", stopReason: "stop" },
    ];

    const result = reconstructState(branch);
    expect(result.completedTurns).toBe(2);
  });

  it("finds last refresh turn", () => {
    const branch = [
      {
        type: "custom",
        customType: "supi-claude-md-refresh",
        details: { turn: 3, contextToken: "t1" },
      },
      { type: "user", role: "user" },
      {
        type: "custom",
        customType: "supi-claude-md-refresh",
        details: { turn: 6, contextToken: "t2" },
      },
    ];

    const result = reconstructState(branch);
    expect(result.lastRefreshTurn).toBe(6);
  });

  it("extracts injected dirs from tool result tags", () => {
    const branch = [
      {
        type: "toolResult",
        role: "tool",
        content: [
          {
            type: "text",
            // biome-ignore lint/security/noSecrets: XML tag fixture in test, not a secret
            text: 'file contents here\n<extension-context source="supi-claude-md" file="packages/foo/CLAUDE.md" turn="5">\ncontext\n</extension-context>',
          },
        ],
      },
    ];

    const result = reconstructState(branch);
    expect(result.injectedDirs.size).toBe(1);
    expect(result.injectedDirs.get("packages/foo")).toEqual({
      turn: 5,
      file: "packages/foo/CLAUDE.md",
    });
  });

  it("handles multiple injected dirs in single tool result", () => {
    const branch = [
      {
        type: "toolResult",
        role: "tool",
        content: [
          {
            type: "text",
            // biome-ignore lint/security/noSecrets: XML tag fixture in test, not a secret
            text: '<extension-context source="supi-claude-md" file="packages/foo/CLAUDE.md" turn="3">\nfoo\n</extension-context>\n\n<extension-context source="supi-claude-md" file="packages/bar/CLAUDE.md" turn="3">\nbar\n</extension-context>',
          },
        ],
      },
    ];

    const result = reconstructState(branch);
    expect(result.injectedDirs.size).toBe(2);
    expect(result.injectedDirs.has("packages/foo")).toBe(true);
    expect(result.injectedDirs.has("packages/bar")).toBe(true);
  });

  it("ignores tags from other extensions", () => {
    const branch = [
      {
        type: "toolResult",
        role: "tool",
        content: [
          {
            type: "text",
            text: '<extension-context source="supi-lsp" file="foo.ts">\ndiagnostics\n</extension-context>',
          },
        ],
      },
    ];

    const result = reconstructState(branch);
    expect(result.injectedDirs.size).toBe(0);
  });

  it("handles mixed branch with all entry types", () => {
    const branch = [
      { type: "user", role: "user" },
      { type: "assistant", role: "assistant", stopReason: "stop" },
      {
        type: "toolResult",
        role: "tool",
        content: [
          {
            type: "text",
            text: '<extension-context source="supi-claude-md" file="pkg/a/CLAUDE.md" turn="1">\na\n</extension-context>',
          },
        ],
      },
      { type: "assistant", role: "assistant", stopReason: "stop" },
      { type: "custom", customType: "supi-claude-md-refresh", details: { turn: 2 } },
      { type: "assistant", role: "assistant", stopReason: "stop" },
    ];

    const result = reconstructState(branch);
    expect(result.completedTurns).toBe(3);
    expect(result.lastRefreshTurn).toBe(2);
    expect(result.injectedDirs.size).toBe(1);
  });

  it("handles missing content gracefully", () => {
    const branch = [
      { type: "toolResult", role: "tool" },
      { type: "toolResult", role: "tool", content: undefined },
    ];

    const result = reconstructState(branch);
    expect(result.injectedDirs.size).toBe(0);
  });
});
