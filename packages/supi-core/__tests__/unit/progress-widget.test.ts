import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
  formatElapsed,
  formatTokens,
  ProgressWidget,
  type WidgetProgress,
} from "../../src/progress-widget.ts";

// ── Pure helpers ──────────────────────────────────────────────────────────

describe("formatTokens", () => {
  it("returns string for 0", () => {
    expect(formatTokens(0)).toBe("0");
  });

  it("returns plain number for values under 1k", () => {
    expect(formatTokens(1)).toBe("1");
    expect(formatTokens(999)).toBe("999");
  });

  it("formats 1k+ with one decimal", () => {
    expect(formatTokens(1_000)).toBe("1.0k");
    expect(formatTokens(1_500)).toBe("1.5k");
    expect(formatTokens(9_999)).toBe("10.0k");
  });

  it("formats 1M+ with one decimal", () => {
    expect(formatTokens(1_000_000)).toBe("1.0M");
    expect(formatTokens(1_500_000)).toBe("1.5M");
  });
});

describe("formatElapsed", () => {
  it("handles sub-second", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(500)).toBe("0s");
    expect(formatElapsed(999)).toBe("0s");
  });

  it("handles sub-minute", () => {
    expect(formatElapsed(1_000)).toBe("1s");
    expect(formatElapsed(30_000)).toBe("30s");
    expect(formatElapsed(59_000)).toBe("59s");
  });

  it("handles minute range", () => {
    expect(formatElapsed(60_000)).toBe("1m 0s");
    expect(formatElapsed(90_000)).toBe("1m 30s");
    expect(formatElapsed(599_000)).toBe("9m 59s");
  });

  it("handles hour boundary", () => {
    expect(formatElapsed(3_600_000)).toBe("1h 0m 0s");
    expect(formatElapsed(3_661_000)).toBe("1h 1m 1s");
    expect(formatElapsed(7_200_000)).toBe("2h 0m 0s");
  });
});

// ── Widget rendering ──────────────────────────────────────────────────────
//
// ProgressWidget uses CancellableLoader (from pi-tui) as its top-line child.
// CancellableLoader internally renders as 2 lines (empty + message), so the
// widget's render output is:
//   - line 0: empty (from CancellableLoader)
//   - line 1: loader message containing spinner + focus + file progress
//   - line 2 (optional): dimmed stats line (Text child, only when stats exist)

const mockTui = { requestRender: vi.fn() };
const mockTheme = { fg: (_color: string, text: string) => text } as Theme;

function makeProgress(overrides: Partial<WidgetProgress> = {}): WidgetProgress {
  return { turns: 0, toolUses: 0, ...overrides };
}

function renderLines(widget: ProgressWidget, width = 120): string[] {
  return widget.render(width);
}

const TOP_LINE = 1; // skip CancellableLoader's internal empty line
const STATS_LINE = 2;

describe("ProgressWidget rendering", () => {
  it("shows only the message when no progress data is available", () => {
    const widget = new ProgressWidget(mockTui, mockTheme, "Running code review…");
    widget.updateProgress(makeProgress());
    const lines = renderLines(widget);
    expect(lines).toHaveLength(2);
    expect(lines[TOP_LINE]).toContain("Running code review…");
  });

  it("shows currentFocus with detail on top line", () => {
    const widget = new ProgressWidget(mockTui, mockTheme, "Running code review…");
    widget.updateProgress(
      makeProgress({
        currentFocus: { label: "Reading", detail: "auth.ts (diff)" },
      }),
    );
    const topLine = renderLines(widget)[TOP_LINE];
    expect(topLine).toContain("Reading: auth.ts (diff)");
  });

  it("shows currentFocus without colon when detail is empty", () => {
    const widget = new ProgressWidget(mockTui, mockTheme, "Running code review…");
    widget.updateProgress(
      makeProgress({
        currentFocus: { label: "Submitting review", detail: "" },
      }),
    );
    const topLine = renderLines(widget)[TOP_LINE];
    expect(topLine).toContain("Submitting review");
    expect(topLine).not.toContain("Submitting review:");
  });

  it("shows file progress on top line", () => {
    const widget = new ProgressWidget(mockTui, mockTheme, "Running code review…");
    widget.updateProgress(
      makeProgress({
        filesInspected: 3,
        filesTotal: 5,
      }),
    );
    const topLine = renderLines(widget)[TOP_LINE];
    expect(topLine).toContain("3/5 files");
  });

  it("shows token stats with arrows on bottom line", () => {
    const widget = new ProgressWidget(mockTui, mockTheme, "Running code review…");
    widget.updateProgress(
      makeProgress({
        tokens: { input: 88_800, output: 1_500, total: 90_300 },
      }),
    );
    const lines = renderLines(widget);
    expect(lines).toHaveLength(3);
    const stats = lines[STATS_LINE];
    expect(stats).toContain("↑ 88.8k");
    expect(stats).toContain("↓ 1.5k");
  });

  it("includes cache read and cache write when present", () => {
    const widget = new ProgressWidget(mockTui, mockTheme, "Running code review…");
    widget.updateProgress(
      makeProgress({
        tokens: {
          input: 50_000,
          output: 2_000,
          total: 52_000,
          cacheRead: 30_000,
          cacheWrite: 5_000,
        },
      }),
    );
    const stats = renderLines(widget)[STATS_LINE];
    expect(stats).toContain("↲ 30.0k");
    expect(stats).toContain("↱ 5.0k");
  });

  it("shows elapsed time on bottom line", () => {
    const widget = new ProgressWidget(mockTui, mockTheme, "Running code review…");
    widget.updateProgress(
      makeProgress({
        elapsedMs: 105_000,
      }),
    );
    const stats = renderLines(widget)[STATS_LINE];
    expect(stats).toContain("1m 45s");
  });

  it("hides elapsed time when under 1 second", () => {
    const widget = new ProgressWidget(mockTui, mockTheme, "Running code review…");
    widget.updateProgress(
      makeProgress({
        elapsedMs: 500,
      }),
    );
    const lines = renderLines(widget);
    expect(lines).toHaveLength(2);
  });

  it("shows turn count on bottom line", () => {
    const widget = new ProgressWidget(mockTui, mockTheme, "Running code review…");
    widget.updateProgress(
      makeProgress({
        turns: 5,
        elapsedMs: 1_000,
      }),
    );
    const stats = renderLines(widget)[STATS_LINE];
    expect(stats).toContain("⟳ 5");
  });

  it("shows tool counts on bottom line sorted by count", () => {
    const widget = new ProgressWidget(mockTui, mockTheme, "Running code review…");
    widget.updateProgress(
      makeProgress({
        toolCounts: { reads: 11, diffs: 5, greps: 3 },
      }),
    );
    const stats = renderLines(widget)[STATS_LINE];
    expect(stats).toContain("11 reads · 5 diffs · 3 greps");
  });

  it("hides bottom line when no stats are available", () => {
    const widget = new ProgressWidget(mockTui, mockTheme, "Running code review…");
    widget.updateProgress(
      makeProgress({
        currentFocus: { label: "Reading", detail: "auth.ts" },
        filesInspected: 1,
        filesTotal: 3,
      }),
    );
    const lines = renderLines(widget);
    // Only loader (2 lines), no stats child
    expect(lines).toHaveLength(2);
    expect(lines[TOP_LINE]).toContain("Reading: auth.ts");
    expect(lines[TOP_LINE]).toContain("1/3 files");
  });

  it("shows both lines when all data is present", () => {
    const widget = new ProgressWidget(mockTui, mockTheme, "Running code review…");
    widget.updateProgress(
      makeProgress({
        currentFocus: { label: "Reading", detail: "auth.ts (diff)" },
        filesInspected: 3,
        filesTotal: 5,
        tokens: {
          input: 88_800,
          output: 1_500,
          total: 90_300,
          cacheRead: 63_700,
          cacheWrite: 12_000,
        },
        elapsedMs: 105_000,
        turns: 5,
        toolCounts: { reads: 11, diffs: 5, greps: 3 },
      }),
    );
    const lines = renderLines(widget);
    expect(lines).toHaveLength(3);

    const topLine = lines[TOP_LINE];
    expect(topLine).toContain("Reading: auth.ts (diff)");
    expect(topLine).toContain("3/5 files");

    const stats = lines[STATS_LINE];
    expect(stats).toContain("↑ 88.8k");
    expect(stats).toContain("↲ 63.7k");
    expect(stats).toContain("↱ 12.0k");
    expect(stats).toContain("↓ 1.5k");
    expect(stats).toContain("1m 45s");
    expect(stats).toContain("⟳ 5");
    expect(stats).toContain("11 reads · 5 diffs · 3 greps");
  });
});
