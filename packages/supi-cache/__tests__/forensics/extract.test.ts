import { describe, expect, it } from "vitest";
import {
  extractCacheTurnEntries,
  extractToolCallWindows,
  findPreviousComparableTurn,
} from "../../src/forensics/extract.ts";
import type { TurnRecord } from "../../src/monitor/state.ts";

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
