import type { Theme } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { type CacheReportSnapshot, formatCacheReport } from "../src/report.ts";
import { CacheMonitorState } from "../src/state.ts";

// Minimal theme mock — fg wraps text with color name for assertion
const mockTheme: Theme = {
  fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
  bg: (color: string, text: string) => `[bg:${color}]${text}[/bg:${color}]`,
} as never;

/** Build a snapshot from live state for testing convenience. */
function snapshotFrom(state: CacheMonitorState): CacheReportSnapshot {
  return { turns: [...state.getTurns()], cacheSupported: state.cacheSupported };
}

describe("formatCacheReport", () => {
  it("shows empty-state message when no turns", () => {
    const lines = formatCacheReport({ turns: [], cacheSupported: false }, mockTheme);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("No cache data yet");
  });

  it("shows header and data rows", () => {
    const state = new CacheMonitorState();
    state.recordTurn({ cacheRead: 0, cacheWrite: 5000, input: 5000 }, 1000);
    state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 2000);

    const lines = formatCacheReport(snapshotFrom(state), mockTheme);
    // header + separator + 2 data rows
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("Turn");
    expect(lines[0]).toContain("Hit%");
    expect(lines[2]).toContain("cold start");
    expect(lines[2]).toContain("[dim]");
  });

  it("formats token counts with k/M suffixes", () => {
    const state = new CacheMonitorState();
    state.recordTurn({ cacheRead: 1500000, cacheWrite: 50000, input: 500000 }, 1000);

    const lines = formatCacheReport(snapshotFrom(state), mockTheme);
    const dataRow = lines[2];
    expect(dataRow).toContain("1.5M");
    expect(dataRow).toContain("50.0k");
    expect(dataRow).toContain("500.0k");
  });

  it("annotates warning rows with warning color", () => {
    const state = new CacheMonitorState();
    state.recordTurn({ cacheRead: 9000, cacheWrite: 0, input: 1000 }, 1000);
    state.flagCompaction();
    state.recordTurn({ cacheRead: 100, cacheWrite: 0, input: 9900 }, 2000);

    const lines = formatCacheReport(snapshotFrom(state), mockTheme);
    expect(lines[3]).toContain("[warning]");
    expect(lines[3]).toContain("⚠ compaction");
  });

  it("shows — for undefined hitRate", () => {
    const state = new CacheMonitorState();
    state.recordTurn({ cacheRead: 0, cacheWrite: 0, input: 0 }, 1000);

    const lines = formatCacheReport(snapshotFrom(state), mockTheme);
    expect(lines[2]).toContain("—");
  });

  it("renders from a deserialized snapshot (no live state)", () => {
    const snapshot: CacheReportSnapshot = {
      turns: [
        {
          turnIndex: 1,
          cacheRead: 5000,
          cacheWrite: 2000,
          input: 5000,
          hitRate: 50,
          timestamp: 1000,
          note: "cold start",
        },
        { turnIndex: 2, cacheRead: 8000, cacheWrite: 0, input: 2000, hitRate: 80, timestamp: 2000 },
      ],
      cacheSupported: true,
    };

    const lines = formatCacheReport(snapshot, mockTheme);
    expect(lines).toHaveLength(4);
    expect(lines[2]).toContain("cold start");
    expect(lines[3]).toContain("80%");
  });

  it("shows all note types", () => {
    const state = new CacheMonitorState();
    state.recordTurn({ cacheRead: 0, cacheWrite: 5000, input: 5000 }, 1000);
    state.flagCompaction();
    state.recordTurn({ cacheRead: 100, cacheWrite: 0, input: 9900 }, 2000);
    state.flagModelChange("anthropic/claude-4");
    state.recordTurn({ cacheRead: 0, cacheWrite: 5000, input: 5000 }, 3000);
    state.updatePromptHash(111);
    state.updatePromptHash(222);
    state.recordTurn({ cacheRead: 100, cacheWrite: 0, input: 9900 }, 4000);
    state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 5000);

    const lines = formatCacheReport(snapshotFrom(state), mockTheme);
    expect(lines).toHaveLength(7);
    expect(lines[2]).toContain("cold start");
    expect(lines[3]).toContain("⚠ compaction");
    expect(lines[4]).toContain("⚠ model changed");
    expect(lines[5]).toContain("⚠ prompt changed");
    expect(lines[6]).not.toContain("⚠");
  });
});
