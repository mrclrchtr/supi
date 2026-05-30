import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import {
  clampReportWidth,
  formatDimLine,
  formatKeyValueLine,
  formatOverflowHint,
  formatReportTitle,
  formatSectionHeader,
  wrapReportText,
} from "../../src/report.ts";

const mockTheme = {
  fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
} as unknown as Theme;

const plainTheme = {
  fg: (_color: string, text: string) => text,
} as unknown as Theme;

describe("report helpers", () => {
  it("clamps report width to a readable minimum", () => {
    expect(clampReportWidth(12)).toBe(24);
    expect(clampReportWidth(60)).toBe(60);
    expect(clampReportWidth(12, 30)).toBe(30);
  });

  it("formats a themed report title", () => {
    expect(formatReportTitle("◆ Context Usage", mockTheme, 80)).toBe(
      "[accent]◆ Context Usage[/accent]",
    );
    expect(formatReportTitle("Heads up", mockTheme, 80, "warning")).toBe(
      "[warning]Heads up[/warning]",
    );
  });

  it("truncates report titles when width is limited", () => {
    const result = formatReportTitle("title-".repeat(6), plainTheme, 10);

    expect(visibleWidth(result)).toBeLessThanOrEqual(10);
    expect(result).toContain("...");
  });

  it("formats a section header with optional metadata", () => {
    expect(formatSectionHeader("Usage by category", null, mockTheme, 80)).toBe(
      "[text]Usage by category[/text]",
    );
    expect(formatSectionHeader("Skills", "1.0k tokens", mockTheme, 80)).toBe(
      "[text]Skills[/text][dim]  1.0k tokens[/dim]",
    );
  });

  it("formats dimmed single lines with indentation", () => {
    expect(formatDimLine("summary available", mockTheme, 80)).toBe("[dim]summary available[/dim]");
    expect(formatDimLine("indented", mockTheme, 80, 2)).toBe("  [dim]indented[/dim]");
  });

  it("truncates dimmed lines when width is limited", () => {
    const result = formatDimLine("line-".repeat(6), plainTheme, 10);

    expect(visibleWidth(result)).toBeLessThanOrEqual(10);
    expect(result).toContain("...");
  });

  it("clamps negative indent for dimmed lines", () => {
    expect(formatDimLine("safe", plainTheme, 10, -2)).toBe("safe");
  });

  it("formats key/value rows", () => {
    expect(
      formatKeyValueLine({
        label: "rewrites",
        value: "5",
        theme: mockTheme,
        width: 80,
      }),
    ).toBe("  [text]rewrites[/text]: [dim]5[/dim]");
    expect(
      formatKeyValueLine({
        label: "fallbacks",
        value: "1",
        theme: mockTheme,
        width: 80,
        indent: 4,
        labelColor: "warning",
        valueColor: "text",
        separator: " => ",
      }),
    ).toBe("    [warning]fallbacks[/warning] => [text]1[/text]");
  });

  it("truncates key/value rows when width is limited", () => {
    const result = formatKeyValueLine({
      label: "very-long-label",
      value: "very-long-value",
      theme: plainTheme,
      width: 12,
    });

    expect(visibleWidth(result)).toBeLessThanOrEqual(12);
    expect(result).toContain("...");
  });

  it("clamps negative indent for key/value rows", () => {
    expect(
      formatKeyValueLine({
        label: "safe",
        value: "1",
        theme: plainTheme,
        width: 20,
        indent: -4,
      }),
    ).toBe("safe: 1");
  });

  it("formats preview overflow hints", () => {
    expect(formatOverflowHint(3, mockTheme, 80, { hint: "run /supi-context full" })).toBe(
      "  [dim]… and 3 more — run /supi-context full[/dim]",
    );
    expect(formatOverflowHint(1, mockTheme, 80, { indent: 4 })).toBe("    [dim]… and 1 more[/dim]");
  });

  it("wraps report text and preserves indentation on every line", () => {
    const lines = wrapReportText("alpha beta gamma delta", 10, { indent: "  " });

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.startsWith("  "))).toBe(true);
  });

  it("wraps report text without indentation by default", () => {
    expect(wrapReportText("alpha beta gamma delta", 10)).toEqual(["alpha beta", "gamma", "delta"]);
  });

  it("clamps wrapped text width to at least one visible column after indentation", () => {
    const lines = wrapReportText("alpha beta", 2, { indent: "     " });

    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every((line) => line.startsWith("     "))).toBe(true);
    expect(lines.every((line) => line.slice(5).length <= 1)).toBe(true);
  });
});
