import { describe, expect, it } from "vitest";
import {
  extractCacheTurnEntries,
  extractNativeCacheTurns,
  extractToolCallWindows,
  findPreviousComparableTurn,
} from "../../../src/forensics/extract.ts";
import type { TurnRecord } from "../../../src/forensics/turns.ts";

/** Return an ISO string for the given epoch milliseconds. */
function iso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

describe("extractCacheTurnEntries", () => {
  it("returns empty array for empty branch", () => {
    expect(extractCacheTurnEntries([])).toEqual([]);
  });

  it("filters only supi-cache-turn custom entries", () => {
    const branch = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: iso(500),
        message: { role: "user" },
      },
      {
        type: "custom",
        customType: "supi-cache-turn",
        id: "2",
        parentId: "1",
        timestamp: iso(1000),
        data: {
          turnIndex: 1,
          cacheRead: 100,
          cacheWrite: 0,
          input: 100,
          hitRate: 50,
          timestamp: 1000,
        },
      },
      {
        type: "message",
        id: "3",
        parentId: "2",
        timestamp: iso(1500),
        message: { role: "assistant" },
      },
      {
        type: "custom",
        customType: "other",
        id: "4",
        parentId: "3",
        timestamp: iso(2000),
        data: {},
      },
    ];
    const turns = extractCacheTurnEntries(branch as never);
    expect(turns).toHaveLength(1);
    expect(turns[0].turnIndex).toBe(1);
  });

  it("ignores entries with missing data", () => {
    const branch = [
      {
        type: "custom",
        customType: "supi-cache-turn",
        id: "1",
        parentId: null,
        timestamp: iso(1000),
      },
    ];
    expect(extractCacheTurnEntries(branch as never)).toEqual([]);
  });
});

function assistantEntry(
  id: string,
  timestamp: number,
  usage: { input: number; cacheRead: number; cacheWrite: number },
  modelInfo: { provider?: string; model?: string } = {},
) {
  const provider = modelInfo.provider ?? "anthropic";
  const model = modelInfo.model ?? "claude";

  return {
    type: "message",
    id,
    parentId: null,
    timestamp: iso(timestamp),
    message: {
      role: "assistant",
      provider,
      model,
      timestamp,
      content: [],
      usage: {
        ...usage,
        output: 10,
        totalTokens: usage.input + usage.cacheRead + usage.cacheWrite + 10,
        cost: {
          input: usage.input / 1000,
          cacheRead: usage.cacheRead / 10000,
          cacheWrite: usage.cacheWrite / 1000,
          output: 0,
          total: 0,
        },
      },
      stopReason: "stop",
    },
  };
}

describe("native cache extraction", () => {
  it("uses native assistant usage and includes cache writes in the hit rate", () => {
    const branch = [
      assistantEntry("1", 1000, { cacheRead: 8000, cacheWrite: 2000, input: 2000 }),
      assistantEntry("2", 2000, { cacheRead: 5000, cacheWrite: 0, input: 5000 }),
    ];

    const turns = extractNativeCacheTurns(branch as never);

    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({
      cacheRead: 8000,
      cacheWrite: 2000,
      input: 2000,
      hitRate: 67,
      note: "cold start",
    });
    expect(turns[1]).toMatchObject({
      hitRate: 50,
      missedTokens: 5000,
      modelChanged: false,
    });
  });

  it("counts a zero-cache request as a miss after cache activity", () => {
    const branch = [
      assistantEntry("1", 1000, { cacheRead: 9000, cacheWrite: 0, input: 1000 }),
      assistantEntry("2", 2000, { cacheRead: 0, cacheWrite: 0, input: 10000 }),
    ];

    const turns = extractNativeCacheTurns(branch as never);

    expect(turns[1]).toMatchObject({ hitRate: 0, missedTokens: 10000 });
  });

  it("uses native entries instead of old duplicate custom records", () => {
    const branch = [
      assistantEntry("1", 1000, { cacheRead: 8000, cacheWrite: 0, input: 2000 }),
      {
        type: "custom",
        customType: "supi-cache-turn",
        id: "2",
        parentId: "1",
        timestamp: iso(1001),
        data: {
          turnIndex: 1,
          cacheRead: 1,
          cacheWrite: 0,
          input: 999,
          hitRate: 0,
          timestamp: 1000,
        },
      },
    ];

    const turns = extractCacheTurnEntries(branch as never);

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ cacheRead: 8000, input: 2000, hitRate: 80 });
  });

  it("derives model changes and resets comparison after compaction", () => {
    const branch = [
      assistantEntry("1", 1000, { cacheRead: 9000, cacheWrite: 0, input: 1000 }),
      {
        type: "model_change",
        id: "2",
        parentId: "1",
        timestamp: iso(2000),
        provider: "openai",
        modelId: "gpt-5",
      },
      assistantEntry(
        "3",
        3000,
        { cacheRead: 0, cacheWrite: 5000, input: 5000 },
        {
          provider: "openai",
          model: "gpt-5",
        },
      ),
      {
        type: "compaction",
        id: "4",
        parentId: "3",
        timestamp: iso(4000),
        summary: "summary",
        firstKeptEntryId: "3",
        tokensBefore: 10000,
      },
      assistantEntry(
        "5",
        5000,
        { cacheRead: 0, cacheWrite: 1000, input: 9000 },
        {
          provider: "openai",
          model: "gpt-5",
        },
      ),
      assistantEntry(
        "6",
        6000,
        { cacheRead: 5000, cacheWrite: 0, input: 5000 },
        {
          provider: "openai",
          model: "gpt-5",
        },
      ),
    ];

    const turns = extractNativeCacheTurns(branch as never);

    expect(turns[1]).toMatchObject({
      cause: { type: "model_change", model: "openai/gpt-5" },
      modelChanged: true,
    });
    expect(turns[2]).toMatchObject({
      cause: { type: "compaction" },
      cacheReset: true,
    });
    expect(findPreviousComparableTurn(turns, 2)).toBeUndefined();
    expect(findPreviousComparableTurn(turns, 3)).toBe(turns[2]);
  });

  it("handles branch summaries as cache resets", () => {
    const branch = [
      assistantEntry("1", 1000, { cacheRead: 9000, cacheWrite: 0, input: 1000 }),
      {
        type: "branch_summary",
        id: "2",
        parentId: "1",
        timestamp: iso(2000),
        fromId: "1",
        summary: "summary",
      },
      assistantEntry("3", 3000, { cacheRead: 0, cacheWrite: 5000, input: 5000 }),
    ];

    const turns = extractNativeCacheTurns(branch as never);

    expect(turns[1]).toMatchObject({
      cause: { type: "branch_summary" },
      cacheReset: true,
    });
  });

  it("keeps prompt fingerprints from old monitor records", () => {
    const fingerprint = {
      customPromptHash: 1,
      appendSystemPromptHash: 0,
      promptGuidelinesHash: 0,
      selectedToolsHash: 0,
      toolSnippetsHash: 0,
      contextFiles: [],
      skills: [],
    };
    const branch = [
      assistantEntry("1", 1000, { cacheRead: 9000, cacheWrite: 0, input: 1000 }),
      {
        type: "custom",
        customType: "supi-cache-turn",
        id: "2",
        parentId: "1",
        timestamp: iso(1001),
        data: {
          turnIndex: 1,
          cacheRead: 9000,
          cacheWrite: 0,
          input: 1000,
          hitRate: 90,
          timestamp: 1000,
          promptFingerprint: fingerprint,
        },
      },
      assistantEntry("3", 2000, { cacheRead: 500, cacheWrite: 0, input: 9500 }),
      {
        type: "custom",
        customType: "supi-cache-turn",
        id: "4",
        parentId: "3",
        timestamp: iso(2001),
        data: {
          turnIndex: 2,
          cacheRead: 500,
          cacheWrite: 0,
          input: 9500,
          hitRate: 5,
          timestamp: 2000,
          note: "⚠ prompt changed",
          cause: { type: "prompt_change" },
          promptFingerprint: { ...fingerprint, customPromptHash: 2 },
        },
      },
    ];

    const turns = extractCacheTurnEntries(branch as never);

    expect(turns[0].promptFingerprint).toEqual(fingerprint);
    expect(turns[1]).toMatchObject({
      cause: { type: "prompt_change" },
      note: "⚠ prompt changed",
    });
  });
});

// biome-ignore lint/security/noSecrets: false positive on test describe name
describe("findPreviousComparableTurn", () => {
  it("returns undefined when no previous turn has hitRate", () => {
    const turns: TurnRecord[] = [
      {
        turnIndex: 1,
        cacheRead: 0,
        cacheWrite: 0,
        input: 100,
        hitRate: undefined,
        timestamp: 1000,
      },
      {
        turnIndex: 2,
        cacheRead: 0,
        cacheWrite: 0,
        input: 100,
        hitRate: undefined,
        timestamp: 2000,
      },
    ];
    expect(findPreviousComparableTurn(turns, 1)).toBeUndefined();
  });

  it("skips undefined hitRate turns", () => {
    const turns: TurnRecord[] = [
      {
        turnIndex: 1,
        cacheRead: 0,
        cacheWrite: 0,
        input: 100,
        hitRate: undefined,
        timestamp: 1000,
      },
      { turnIndex: 2, cacheRead: 100, cacheWrite: 0, input: 100, hitRate: 50, timestamp: 2000 },
      {
        turnIndex: 3,
        cacheRead: 0,
        cacheWrite: 0,
        input: 100,
        hitRate: undefined,
        timestamp: 3000,
      },
      { turnIndex: 4, cacheRead: 80, cacheWrite: 0, input: 20, hitRate: 80, timestamp: 4000 },
    ];
    expect(findPreviousComparableTurn(turns, 3)?.turnIndex).toBe(2);
    expect(findPreviousComparableTurn(turns, 1)).toBeUndefined();
  });
});

describe("extractToolCallWindows", () => {
  it("returns empty map when no cache turns", () => {
    const branch = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: iso(1000),
        message: { role: "user" },
      },
    ];
    expect(extractToolCallWindows(branch as never)).toEqual(new Map());
  });

  it("extracts preceding tool calls for a turn", () => {
    // Turn 1 only — no preceding messages
    const branch = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: iso(1000),
        message: {
          role: "assistant",
          content: [{ type: "toolCall", name: "bash", arguments: { command: "ls" } }],
        },
      },
      {
        type: "custom",
        customType: "supi-cache-turn",
        id: "2",
        parentId: "1",
        timestamp: iso(1001),
        data: {
          turnIndex: 1,
          cacheRead: 100,
          cacheWrite: 0,
          input: 100,
          hitRate: 50,
          timestamp: 1000,
        },
      },
    ];
    const windows = extractToolCallWindows(branch as never, 2);
    expect(windows.get(1)).toEqual([]); // No preceding assistant messages
  });

  it("collects tool calls from preceding turns within timestamp window", () => {
    // Msg at 1000 (turn 1), Msg at 2000 (turn 2), Msg at 3000 (turn 3)
    const branch = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: iso(1000),
        message: {
          role: "assistant",
          content: [{ type: "toolCall", name: "read", arguments: { file_path: "a.ts" } }],
        },
      },
      {
        type: "custom",
        customType: "supi-cache-turn",
        id: "2",
        parentId: "1",
        timestamp: iso(1001),
        data: {
          turnIndex: 1,
          cacheRead: 100,
          cacheWrite: 0,
          input: 100,
          hitRate: 50,
          timestamp: 1000,
        },
      },
      {
        type: "message",
        id: "3",
        parentId: "2",
        timestamp: iso(2000),
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", name: "bash", arguments: { command: "npm test" } },
            { type: "toolCall", name: "write", arguments: { file_path: "b.ts", content: "x" } },
          ],
        },
      },
      {
        type: "custom",
        customType: "supi-cache-turn",
        id: "4",
        parentId: "3",
        timestamp: iso(2001),
        data: {
          turnIndex: 2,
          cacheRead: 80,
          cacheWrite: 0,
          input: 120,
          hitRate: 40,
          timestamp: 2000,
        },
      },
      {
        type: "message",
        id: "5",
        parentId: "4",
        timestamp: iso(3000),
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              name: "edit",
              arguments: { file_path: "c.ts", old_string: "a", new_string: "b" },
            },
          ],
        },
      },
      {
        type: "custom",
        customType: "supi-cache-turn",
        id: "6",
        parentId: "5",
        timestamp: iso(3001),
        data: {
          turnIndex: 3,
          cacheRead: 10,
          cacheWrite: 0,
          input: 190,
          hitRate: 5,
          timestamp: 3000,
        },
      },
    ];

    const windows = extractToolCallWindows(branch as never, 2);

    // Turn 1: window [1000, 1000) → empty (no preceding assistant messages)
    expect(windows.get(1)).toEqual([]);

    // Turn 2: window [1000, 2000) → msg at 1000 (read) included, msg at 2000 excluded
    const turn2Tools = windows.get(2) ?? [];
    expect(turn2Tools).toHaveLength(1);
    expect(turn2Tools[0].toolName).toBe("read");

    // Turn 3: window [1000, 3000) → msgs at 1000 + 2000 included, msg at 3000 excluded
    const turn3Tools = windows.get(3) ?? [];
    expect(turn3Tools).toHaveLength(3);
    expect(turn3Tools.map((t) => t.toolName)).toEqual(["read", "bash", "write"]);
  });

  it("respects lookback limit via turn count", () => {
    const branch = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: iso(1000),
        message: {
          role: "assistant",
          content: [{ type: "toolCall", name: "read", arguments: { file_path: "a.ts" } }],
        },
      },
      {
        type: "custom",
        customType: "supi-cache-turn",
        id: "2",
        parentId: "1",
        timestamp: iso(1001),
        data: {
          turnIndex: 1,
          cacheRead: 100,
          cacheWrite: 0,
          input: 100,
          hitRate: 50,
          timestamp: 1000,
        },
      },
      {
        type: "message",
        id: "3",
        parentId: "2",
        timestamp: iso(2000),
        message: {
          role: "assistant",
          content: [{ type: "toolCall", name: "bash", arguments: { command: "ls" } }],
        },
      },
      {
        type: "custom",
        customType: "supi-cache-turn",
        id: "4",
        parentId: "3",
        timestamp: iso(2001),
        data: {
          turnIndex: 2,
          cacheRead: 90,
          cacheWrite: 0,
          input: 110,
          hitRate: 45,
          timestamp: 2000,
        },
      },
      {
        type: "message",
        id: "5",
        parentId: "4",
        timestamp: iso(3000),
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", name: "write", arguments: { file_path: "b.ts", content: "x" } },
          ],
        },
      },
      {
        type: "custom",
        customType: "supi-cache-turn",
        id: "6",
        parentId: "5",
        timestamp: iso(3001),
        data: {
          turnIndex: 3,
          cacheRead: 10,
          cacheWrite: 0,
          input: 190,
          hitRate: 5,
          timestamp: 3000,
        },
      },
    ];

    // lookback = 1: window [2000, 3000) for turn 3 → only msg at 2000 (bash)
    const windows = extractToolCallWindows(branch as never, 1);

    const turn3Tools = windows.get(3) ?? [];
    expect(turn3Tools).toHaveLength(1);
    expect(turn3Tools[0].toolName).toBe("bash");
  });
});
