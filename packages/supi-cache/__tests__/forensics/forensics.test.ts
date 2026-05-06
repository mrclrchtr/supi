import { describe, expect, it } from "vitest";
import { buildFindings, parseDuration } from "../../src/forensics/forensics.ts";
import type { ToolCallShape } from "../../src/forensics/types.ts";
import type { TurnRecord } from "../../src/monitor/state.ts";

function makeTurn(overrides: Partial<TurnRecord> = {}): TurnRecord {
  return {
    turnIndex: 1,
    cacheRead: 100,
    cacheWrite: 0,
    input: 100,
    hitRate: 50,
    timestamp: 1000,
    ...overrides,
  };
}

function makeToolShape(overrides: Partial<ToolCallShape> = {}): ToolCallShape {
  return {
    toolName: "bash",
    paramKeys: ["command"],
    paramShapes: { command: { kind: "string", len: 10, multiline: false } },
    ...overrides,
  };
}

describe("parseDuration", () => {
  it("parses days", () => {
    expect(parseDuration("7d")).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseDuration("1d")).toBe(1 * 24 * 60 * 60 * 1000);
  });

  it("parses hours", () => {
    expect(parseDuration("24h")).toBe(24 * 60 * 60 * 1000);
    expect(parseDuration("1h")).toBe(1 * 60 * 60 * 1000);
  });

  it("parses minutes", () => {
    expect(parseDuration("30m")).toBe(30 * 60 * 1000);
    expect(parseDuration("1m")).toBe(1 * 60 * 1000);
  });

  it("is case-insensitive", () => {
    expect(parseDuration("7D")).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseDuration("24H")).toBe(24 * 60 * 60 * 1000);
    expect(parseDuration("30M")).toBe(30 * 60 * 1000);
  });

  it("defaults to 7 days for invalid input", () => {
    expect(parseDuration("invalid")).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseDuration("")).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseDuration("7x")).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("buildFindings", () => {
  it("returns empty array when no regression turns", () => {
    const turns: TurnRecord[] = [
      makeTurn({ turnIndex: 1, hitRate: 50, timestamp: 1000 }),
      makeTurn({ turnIndex: 2, hitRate: 60, timestamp: 2000 }), // improvement, not regression
    ];
    const toolWindows = new Map<number, ToolCallShape[]>();
    const findings = buildFindings("s1", turns, toolWindows, 25);
    expect(findings).toHaveLength(0);
  });

  it("includes turns with drop above regression threshold", () => {
    const turns: TurnRecord[] = [
      makeTurn({ turnIndex: 1, hitRate: 90, timestamp: 1000 }),
      makeTurn({ turnIndex: 2, hitRate: 10, timestamp: 2000 }),
    ];
    const toolWindows = new Map<number, ToolCallShape[]>();
    const findings = buildFindings("s1", turns, toolWindows, 25);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      sessionId: "s1",
      turnIndex: 2,
      previousRate: 90,
      currentRate: 10,
      drop: 80,
      cause: { type: "unknown" },
    });
  });

  it("excludes small drops below regression threshold", () => {
    const turns: TurnRecord[] = [
      makeTurn({ turnIndex: 1, hitRate: 50, timestamp: 1000 }),
      makeTurn({ turnIndex: 2, hitRate: 45, timestamp: 2000 }), // 5pp drop
    ];
    const toolWindows = new Map<number, ToolCallShape[]>();
    const findings = buildFindings("s1", turns, toolWindows, 25);
    expect(findings).toHaveLength(0);
  });

  it("includes small drops when threshold is lowered", () => {
    const turns: TurnRecord[] = [
      makeTurn({ turnIndex: 1, hitRate: 50, timestamp: 1000 }),
      makeTurn({ turnIndex: 2, hitRate: 45, timestamp: 2000 }), // 5pp drop
    ];
    const toolWindows = new Map<number, ToolCallShape[]>();
    const findings = buildFindings("s1", turns, toolWindows, 3);
    expect(findings).toHaveLength(1);
    expect(findings[0].drop).toBe(5);
  });

  it("always includes persisted-cause turns regardless of drop", () => {
    const turns: TurnRecord[] = [
      makeTurn({ turnIndex: 1, hitRate: 50, timestamp: 1000 }),
      makeTurn({ turnIndex: 2, hitRate: 48, timestamp: 2000, cause: { type: "compaction" } }),
    ];
    const toolWindows = new Map<number, ToolCallShape[]>();
    const findings = buildFindings("s1", turns, toolWindows, 25);

    expect(findings).toHaveLength(1);
    expect(findings[0].cause).toEqual({ type: "compaction" });
    expect(findings[0].drop).toBe(2);
  });

  it("resolves note-based cause for legacy records", () => {
    const turns: TurnRecord[] = [
      makeTurn({ turnIndex: 1, hitRate: 50, timestamp: 1000 }),
      makeTurn({ turnIndex: 2, hitRate: 50, timestamp: 2000, note: "⚠ compaction" }),
    ];
    const toolWindows = new Map<number, ToolCallShape[]>();
    const findings = buildFindings("s1", turns, toolWindows, 25);

    expect(findings).toHaveLength(1);
    expect(findings[0].cause).toEqual({ type: "compaction" });
  });

  it("resolves note-based model_change from legacy records", () => {
    const turns: TurnRecord[] = [
      makeTurn({ turnIndex: 1, hitRate: 50, timestamp: 1000 }),
      makeTurn({ turnIndex: 2, hitRate: 50, timestamp: 2000, note: "⚠ model changed" }),
    ];
    const toolWindows = new Map<number, ToolCallShape[]>();
    const findings = buildFindings("s1", turns, toolWindows, 25);

    expect(findings).toHaveLength(1);
    expect(findings[0].cause).toEqual({ type: "model_change", model: "unknown" });
  });

  it("skips turns with undefined hitRate", () => {
    const turns: TurnRecord[] = [
      makeTurn({ turnIndex: 1, hitRate: undefined, timestamp: 1000 }),
      makeTurn({ turnIndex: 2, hitRate: 10, timestamp: 2000 }),
    ];
    const toolWindows = new Map<number, ToolCallShape[]>();
    const findings = buildFindings("s1", turns, toolWindows, 25);

    expect(findings).toHaveLength(0);
  });

  it("computes idleGapMinutes from timestamp gap", () => {
    const turns: TurnRecord[] = [
      makeTurn({ turnIndex: 1, hitRate: 90, timestamp: 0 }),
      makeTurn({ turnIndex: 2, hitRate: 10, timestamp: 10 * 60 * 1000 }), // 10 min gap
    ];
    const toolWindows = new Map<number, ToolCallShape[]>();
    const findings = buildFindings("s1", turns, toolWindows, 25);

    expect(findings).toHaveLength(1);
    expect(findings[0].idleGapMinutes).toBe(10);
  });

  it("attaches toolsBefore from toolWindows", () => {
    const turns: TurnRecord[] = [
      makeTurn({ turnIndex: 1, hitRate: 90, timestamp: 1000 }),
      makeTurn({ turnIndex: 2, hitRate: 10, timestamp: 2000 }),
    ];
    const tools: ToolCallShape[] = [makeToolShape({ toolName: "write", paramKeys: ["file_path"] })];
    const toolWindows = new Map<number, ToolCallShape[]>([[2, tools]]);
    const findings = buildFindings("s1", turns, toolWindows, 25);

    expect(findings[0].toolsBefore).toEqual(tools);
  });

  it("extracts _pathsInvolved from write/edit tools", () => {
    const turns: TurnRecord[] = [
      makeTurn({ turnIndex: 1, hitRate: 90, timestamp: 1000 }),
      makeTurn({ turnIndex: 2, hitRate: 10, timestamp: 2000 }),
    ];
    const tools: ToolCallShape[] = [
      makeToolShape({
        toolName: "write",
        paramKeys: ["file_path", "content"],
        paramShapes: {
          file_path: { kind: "string", len: 8, multiline: false },
          content: { kind: "string", len: 20, multiline: true },
        },
      }),
    ];
    const toolWindows = new Map<number, ToolCallShape[]>([[2, tools]]);
    const findings = buildFindings("s1", turns, toolWindows, 25);

    expect(findings[0]._pathsInvolved).toEqual(["[write] file_path"]);
  });

  it("extracts _commandSummaries from bash tools", () => {
    const turns: TurnRecord[] = [
      makeTurn({ turnIndex: 1, hitRate: 90, timestamp: 1000 }),
      makeTurn({ turnIndex: 2, hitRate: 10, timestamp: 2000 }),
    ];
    const tools: ToolCallShape[] = [
      makeToolShape({
        toolName: "bash",
        paramKeys: ["command"],
        paramShapes: { command: { kind: "string", len: 42, multiline: true } },
      }),
    ];
    const toolWindows = new Map<number, ToolCallShape[]>([[2, tools]]);
    const findings = buildFindings("s1", turns, toolWindows, 25);

    expect(findings[0]._commandSummaries).toEqual(["bash(42 chars, multiline)"]);
  });

  it("does not set human detail fields when no relevant tools", () => {
    const turns: TurnRecord[] = [
      makeTurn({ turnIndex: 1, hitRate: 90, timestamp: 1000 }),
      makeTurn({ turnIndex: 2, hitRate: 10, timestamp: 2000 }),
    ];
    const tools: ToolCallShape[] = [
      makeToolShape({
        toolName: "read",
        paramKeys: ["file_path"],
        paramShapes: { file_path: { kind: "string", len: 8, multiline: false } },
      }),
    ];
    const toolWindows = new Map<number, ToolCallShape[]>([[2, tools]]);
    const findings = buildFindings("s1", turns, toolWindows, 25);

    expect(findings[0]._pathsInvolved).toBeUndefined();
    expect(findings[0]._commandSummaries).toBeUndefined();
  });
});
