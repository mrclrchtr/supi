import type { Theme } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { PromptFingerprint } from "../../src/fingerprint.ts";
import { CacheMonitorState } from "../../src/monitor/state.ts";
import { type CacheReportSnapshot, formatCacheReport } from "../../src/report/history.ts";

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
    state.updatePromptFingerprint(fp({ customPromptHash: 111 }));
    state.updatePromptFingerprint(fp({ customPromptHash: 222 }));
    state.recordTurn({ cacheRead: 100, cacheWrite: 0, input: 9900 }, 4000);
    state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 5000);

    const lines = formatCacheReport(snapshotFrom(state), mockTheme);
    // 5 rows (header + separator + 5 data rows) + blank + "Regression details:" + 3 detail entries
    expect(lines).toHaveLength(12);
    expect(lines[2]).toContain("cold start");
    expect(lines[3]).toContain("⚠ compaction");
    expect(lines[4]).toContain("⚠ model changed");
    expect(lines[5]).toContain("⚠ prompt changed");
    expect(lines[6]).not.toContain("⚠");
    // Regression details section
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
    const state = new CacheMonitorState();
    state.recordTurn({ cacheRead: 9000, cacheWrite: 0, input: 1000 }, 1000);
    // First prompt fingerprint with tools=[read, bash]
    state.updatePromptFingerprint(fp({ selectedToolsHash: 100, toolSnippetsHash: 0 }));
    state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 2000);
    // Second prompt fingerprint with different tools
    state.updatePromptFingerprint(fp({ selectedToolsHash: 999, toolSnippetsHash: 0 }));
    state.recordTurn({ cacheRead: 500, cacheWrite: 0, input: 9500 }, 3000);

    const lines = formatCacheReport(snapshotFrom(state), mockTheme);
    expect(lines.some((l: string) => l.includes("• tools"))).toBe(true);
  });

  it("shows fingerprint diff bullets for context file changes", () => {
    const state = new CacheMonitorState();
    state.recordTurn({ cacheRead: 9000, cacheWrite: 0, input: 1000 }, 1000);
    // First fingerprint with one context file
    state.updatePromptFingerprint(fp({ contextFiles: [{ path: "a.md", hash: 100 }] }));
    state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 2000);

    // Second fingerprint with an added context file
    state.updatePromptFingerprint(
      fp({
        contextFiles: [
          { path: "a.md", hash: 100 },
          { path: "b.md", hash: 200 },
        ],
      }),
    );
    state.recordTurn({ cacheRead: 500, cacheWrite: 0, input: 9500 }, 3000);

    const lines = formatCacheReport(snapshotFrom(state), mockTheme);
    expect(lines.some((l: string) => l.includes("contextFiles (+1)"))).toBe(true);
  });

  it("does not show regression details when no causes", () => {
    const state = new CacheMonitorState();
    state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 1000);
    state.recordTurn({ cacheRead: 7000, cacheWrite: 0, input: 3000 }, 2000);

    const lines = formatCacheReport(snapshotFrom(state), mockTheme);
    expect(lines.some((l: string) => l.includes("Regression details"))).toBe(false);
  });
});
