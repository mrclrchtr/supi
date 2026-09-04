import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { PromptFingerprint } from "../../../src/fingerprint.ts";
import type { TurnRecord } from "../../../src/forensics/turns.ts";
import { type CacheReportSnapshot, formatCacheReport } from "../../../src/report/history.ts";

function fp(overrides: Partial<PromptFingerprint> = {}): PromptFingerprint {
  return {
    customPromptHash: 0,
    appendSystemPromptHash: 0,
    promptGuidelinesHash: 0,
    selectedToolsHash: 0,
    toolSnippetsHash: 0,
    contextFiles: [],
    skills: [],
    ...overrides,
  };
}

function turn(overrides: Partial<TurnRecord> = {}): TurnRecord {
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

function snapshot(turns: TurnRecord[]): CacheReportSnapshot {
  return { turns };
}

// Minimal theme mock — fg wraps text with color name for assertion
const mockTheme: Theme = {
  fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
  bg: (color: string, text: string) => `[bg:${color}]${text}[/bg:${color}]`,
} as never;

describe("formatCacheReport", () => {
  it("shows empty-state message when no turns", () => {
    const lines = formatCacheReport({ turns: [] }, mockTheme);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("No cache data yet");
  });

  it("shows header and data rows", () => {
    const turns = [
      turn({
        turnIndex: 1,
        cacheRead: 0,
        cacheWrite: 5000,
        input: 5000,
        hitRate: 0,
        note: "cold start",
      }),
      turn({ turnIndex: 2, cacheRead: 8000, input: 2000, hitRate: 80, timestamp: 2000 }),
    ];

    const lines = formatCacheReport(snapshot(turns), mockTheme);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("Turn");
    expect(lines[0]).toContain("Hit%");
    expect(lines[2]).toContain("cold start");
    expect(lines[2]).toContain("[dim]");
  });

  it("formats token counts with k/M suffixes", () => {
    const turns = [turn({ cacheRead: 1_500_000, cacheWrite: 50_000, input: 500_000 })];

    const lines = formatCacheReport(snapshot(turns), mockTheme);
    const dataRow = lines[2];
    expect(dataRow).toContain("1.5M");
    expect(dataRow).toContain("50.0k");
    expect(dataRow).toContain("500.0k");
  });

  it("annotates warning rows with warning color", () => {
    const turns = [
      turn({ turnIndex: 1, cacheRead: 9000, input: 1000, note: "cold start" }),
      turn({
        turnIndex: 2,
        cacheRead: 100,
        input: 9900,
        hitRate: 1,
        timestamp: 2000,
        cause: { type: "compaction" },
        note: "⚠ compaction",
      }),
    ];

    const lines = formatCacheReport(snapshot(turns), mockTheme);
    expect(lines[3]).toContain("[warning]");
    expect(lines[3]).toContain("⚠ compaction");
  });

  it("shows — for undefined hitRate", () => {
    const turns = [turn({ cacheRead: 0, cacheWrite: 0, input: 0, hitRate: undefined })];

    const lines = formatCacheReport(snapshot(turns), mockTheme);
    expect(lines[2]).toContain("—");
  });

  it("renders from a deserialized snapshot", () => {
    const turns = [
      turn({
        turnIndex: 1,
        cacheRead: 5000,
        cacheWrite: 2000,
        input: 5000,
        hitRate: 42,
        note: "cold start",
      }),
      turn({ turnIndex: 2, cacheRead: 8000, input: 2000, hitRate: 80, timestamp: 2000 }),
    ];

    const lines = formatCacheReport(snapshot(turns), mockTheme);
    expect(lines).toHaveLength(4);
    expect(lines[2]).toContain("cold start");
    expect(lines[3]).toContain("80%");
  });

  it("shows all note types", () => {
    const turns = [
      turn({
        turnIndex: 1,
        cacheRead: 0,
        cacheWrite: 5000,
        input: 5000,
        hitRate: 0,
        note: "cold start",
      }),
      turn({
        turnIndex: 2,
        cacheRead: 100,
        input: 9900,
        hitRate: 1,
        timestamp: 2000,
        cause: { type: "compaction" },
        note: "⚠ compaction",
      }),
      turn({
        turnIndex: 3,
        cacheRead: 0,
        cacheWrite: 5000,
        input: 5000,
        hitRate: 0,
        timestamp: 3000,
        cause: { type: "model_change", model: "anthropic/claude-4" },
        note: "⚠ model changed",
      }),
      turn({
        turnIndex: 4,
        cacheRead: 100,
        input: 9900,
        hitRate: 1,
        timestamp: 4000,
        cause: { type: "prompt_change" },
        note: "⚠ prompt changed",
      }),
      turn({ turnIndex: 5, cacheRead: 8000, input: 2000, hitRate: 80, timestamp: 5000 }),
    ];

    const lines = formatCacheReport(snapshot(turns), mockTheme);
    expect(lines).toHaveLength(12);
    expect(lines[2]).toContain("cold start");
    expect(lines[3]).toContain("⚠ compaction");
    expect(lines[4]).toContain("⚠ model changed");
    expect(lines[5]).toContain("⚠ prompt changed");
    expect(lines[6]).not.toContain("⚠");
    expect(lines[7]).toBe("");
    expect(lines[8]).toContain("Regression details:");
    expect(lines[9]).toContain("Turn 2");
    expect(lines[9]).toContain("compaction");
    expect(lines[10]).toContain("Turn 3");
    expect(lines[10]).toContain("model changed");
    expect(lines[11]).toContain("Turn 4");
    expect(lines[11]).toContain("prompt changed");
  });

  it("shows fingerprint diff bullets for prompt-change regression", () => {
    const turns = [
      turn({
        turnIndex: 1,
        cacheRead: 9000,
        input: 1000,
        promptFingerprint: fp({ selectedToolsHash: 100 }),
      }),
      turn({
        turnIndex: 2,
        cacheRead: 500,
        input: 9500,
        hitRate: 5,
        timestamp: 2000,
        cause: { type: "prompt_change" },
        promptFingerprint: fp({ selectedToolsHash: 999 }),
      }),
    ];

    const lines = formatCacheReport(snapshot(turns), mockTheme);
    expect(lines.some((line) => line.includes("• tools"))).toBe(true);
  });

  it("shows fingerprint diff bullets for context file changes", () => {
    const turns = [
      turn({
        turnIndex: 1,
        cacheRead: 9000,
        input: 1000,
        promptFingerprint: fp({ contextFiles: [{ path: "a.md", hash: 100 }] }),
      }),
      turn({
        turnIndex: 2,
        cacheRead: 500,
        input: 9500,
        hitRate: 5,
        timestamp: 2000,
        cause: { type: "prompt_change" },
        promptFingerprint: fp({
          contextFiles: [
            { path: "a.md", hash: 100 },
            { path: "b.md", hash: 200 },
          ],
        }),
      }),
    ];

    const lines = formatCacheReport(snapshot(turns), mockTheme);
    expect(lines.some((line) => line.includes("contextFiles (+1)"))).toBe(true);
  });

  it("does not show regression details when no causes", () => {
    const turns = [
      turn({ turnIndex: 1, cacheRead: 8000, input: 2000 }),
      turn({ turnIndex: 2, cacheRead: 7000, input: 3000, hitRate: 70, timestamp: 2000 }),
    ];

    const lines = formatCacheReport(snapshot(turns), mockTheme);
    expect(lines.some((line) => line.includes("Regression details"))).toBe(false);
  });
});
