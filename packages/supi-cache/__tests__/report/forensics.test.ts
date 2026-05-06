import type { Theme } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { formatForensicsReport } from "../../src/report/forensics.ts";

const mockTheme: Theme = {
  fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
  bg: (color: string, text: string) => `[bg:${color}]${text}[/bg:${color}]`,
} as never;

describe("formatForensicsReport", () => {
  it("shows empty-state message when no regressions", () => {
    const lines = formatForensicsReport(
      { pattern: "hotspots", sessionsScanned: 5, turnsAnalyzed: 20 },
      mockTheme,
    );
    expect(lines.some((l: string) => l.includes("No regressions found"))).toBe(true);
  });

  it("renders breakdown sorted by count with pct, bars, and summary", () => {
    const lines = formatForensicsReport(
      {
        pattern: "breakdown",
        breakdown: { compaction: 2, model_change: 1, prompt_change: 0, unknown: 1, idle: 0 },
        findings: [
          {
            sessionId: "a",
            turnIndex: 1,
            previousRate: 90,
            currentRate: 30,
            drop: 60,
            cause: { type: "compaction" },
            toolsBefore: [],
          },
          {
            sessionId: "b",
            turnIndex: 2,
            previousRate: 80,
            currentRate: 20,
            drop: 60,
            cause: { type: "compaction" },
            toolsBefore: [],
          },
          {
            sessionId: "c",
            turnIndex: 3,
            previousRate: 70,
            currentRate: 40,
            drop: 30,
            cause: { type: "model_change", model: "x" },
            toolsBefore: [],
          },
          {
            sessionId: "d",
            turnIndex: 4,
            previousRate: 60,
            currentRate: 10,
            drop: 50,
            cause: { type: "unknown" },
            toolsBefore: [],
          },
        ],
        sessionsScanned: 3,
        turnsAnalyzed: 15,
      },
      mockTheme,
    );

    // Cardinality: compaction (2) should come before model_change (1) and unknown (1)
    const compactionLine = lines.findIndex((l: string) => l.includes("compaction"));
    const modelLine = lines.findIndex((l: string) => l.includes("model_change"));
    const unknownLine = lines.findIndex((l: string) => l.includes("unknown"));
    expect(compactionLine).toBeLessThan(modelLine);
    expect(compactionLine).toBeLessThan(unknownLine);

    // Percentages
    expect(lines.some((l: string) => l.includes("50%"))).toBe(true);
    expect(lines.some((l: string) => l.includes("25%"))).toBe(true);

    // Avg drops
    expect(lines.some((l: string) => l.includes("avg 60pp drop"))).toBe(true);
    expect(lines.some((l: string) => l.includes("avg 30pp drop"))).toBe(true);

    // Summary
    expect(lines.some((l: string) => l.includes("total 4"))).toBe(true);
    expect(lines.some((l: string) => l.includes("26.7% of 15 turns"))).toBe(true);
    expect(lines.some((l: string) => l.includes("~1.3/session"))).toBe(true);

    // Zero-count causes are skipped
    expect(lines.some((l: string) => l.includes("[accent]█████"))).toBe(true);
    expect(lines.some((l: string) => l.includes("prompt_change"))).toBe(false);
  });

  it("shows idle/unknown clarification note when idle > 0", () => {
    const lines = formatForensicsReport(
      {
        pattern: "breakdown",
        breakdown: { compaction: 0, model_change: 0, prompt_change: 0, unknown: 5, idle: 3 },
        findings: [],
        sessionsScanned: 2,
        turnsAnalyzed: 50,
      },
      mockTheme,
    );

    expect(lines.some((l: string) => l.includes("idle regressions"))).toBe(true);
    expect(lines.some((l: string) => l.includes("unknown drops with turn gaps"))).toBe(true);
  });

  it("renders hotspot findings with cause and drop", () => {
    const lines = formatForensicsReport(
      {
        pattern: "hotspots",
        findings: [
          {
            sessionId: "abc123",
            turnIndex: 3,
            previousRate: 90,
            currentRate: 10,
            drop: 80,
            cause: { type: "compaction" },
            toolsBefore: [],
          },
        ],
        sessionsScanned: 2,
        turnsAnalyzed: 8,
      },
      mockTheme,
    );

    expect(lines.some((l: string) => l.includes("abc123") || l.includes("abc12"))).toBe(true);
    expect(lines.some((l: string) => l.includes("Turn 3"))).toBe(true);
    expect(lines.some((l: string) => l.includes("80pp drop"))).toBe(true);
    expect(lines.some((l: string) => l.includes("compaction"))).toBe(true);
    expect(lines.some((l: string) => l.includes("90% → 10%"))).toBe(true);
  });

  it("renders idle cause with gap minutes", () => {
    const lines = formatForensicsReport(
      {
        pattern: "idle",
        findings: [
          {
            sessionId: "def456",
            turnIndex: 5,
            previousRate: 80,
            currentRate: 20,
            drop: 60,
            cause: { type: "idle", idleGapMinutes: 42 },
            toolsBefore: [],
          },
        ],
        sessionsScanned: 1,
        turnsAnalyzed: 6,
      },
      mockTheme,
    );

    expect(lines.some((l: string) => l.includes("idle (42 min gap)"))).toBe(true);
  });

  it("renders model_change cause with model name", () => {
    const lines = formatForensicsReport(
      {
        pattern: "hotspots",
        findings: [
          {
            sessionId: "ghi789",
            turnIndex: 2,
            previousRate: 85,
            currentRate: 30,
            drop: 55,
            cause: { type: "model_change", model: "anthropic/claude-4" },
            toolsBefore: [],
          },
        ],
        sessionsScanned: 1,
        turnsAnalyzed: 3,
      },
      mockTheme,
    );

    expect(lines.some((l: string) => l.includes("model changed to anthropic/claude-4"))).toBe(true);
  });

  it("renders preceding tools for correlate pattern", () => {
    const lines = formatForensicsReport(
      {
        pattern: "correlate",
        findings: [
          {
            sessionId: "jkl012",
            turnIndex: 4,
            previousRate: 70,
            currentRate: 20,
            drop: 50,
            cause: { type: "unknown" },
            toolsBefore: [
              { toolName: "bash", paramKeys: ["command"], paramShapes: {} },
              { toolName: "write", paramKeys: ["file_path", "content"], paramShapes: {} },
            ],
          },
        ],
        sessionsScanned: 1,
        turnsAnalyzed: 5,
      },
      mockTheme,
    );

    expect(lines.some((l: string) => l.includes("Preceding tools:"))).toBe(true);
    expect(lines.some((l: string) => l.includes("bash (command)"))).toBe(true);
    expect(lines.some((l: string) => l.includes("write (file_path, content)"))).toBe(true);
  });

  it("renders _pathsInvolved when present", () => {
    const lines = formatForensicsReport(
      {
        pattern: "hotspots",
        findings: [
          {
            sessionId: "mno345",
            turnIndex: 2,
            previousRate: 60,
            currentRate: 10,
            drop: 50,
            cause: { type: "prompt_change" },
            toolsBefore: [],
            _pathsInvolved: ["src/app.ts", "src/lib.ts"],
          },
        ],
        sessionsScanned: 1,
        turnsAnalyzed: 3,
      },
      mockTheme,
    );

    expect(lines.some((l: string) => l.includes("Files:"))).toBe(true);
    expect(lines.some((l: string) => l.includes("src/app.ts"))).toBe(true);
    expect(lines.some((l: string) => l.includes("src/lib.ts"))).toBe(true);
  });

  it("does not show tools section when toolsBefore is empty", () => {
    const lines = formatForensicsReport(
      {
        pattern: "correlate",
        findings: [
          {
            sessionId: "pqr678",
            turnIndex: 2,
            previousRate: 50,
            currentRate: 10,
            drop: 40,
            cause: { type: "unknown" },
            toolsBefore: [],
          },
        ],
        sessionsScanned: 1,
        turnsAnalyzed: 2,
      },
      mockTheme,
    );

    expect(lines.some((l: string) => l.includes("Preceding tools:"))).toBe(false);
  });
});
