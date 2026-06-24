import { describe, expect, it } from "vitest";
import { truncateToolContent } from "../../src/tool/truncate-output.ts";

describe("truncateToolContent", () => {
  it("leaves short content unchanged with truncated=false", () => {
    const r = truncateToolContent("hello\nworld\n");
    expect(r.truncated).toBe(false);
    expect(r.text).toBe("hello\nworld\n");
  });

  it("head-truncates content exceeding the default line limit and appends a notice", () => {
    const big = `${Array.from({ length: 3000 }, (_, i) => `line ${i}`).join("\n")}\n`;
    const r = truncateToolContent(big);
    expect(r.truncated).toBe(true);
    // head kept
    expect(r.text.startsWith("line 0\n")).toBe(true);
    // notice shape: [truncated: kept N of M lines (X of Y)]
    expect(r.text).toMatch(/\[truncated: kept \d+ of \d+ lines \([^)]+\)\]/);
  });

  it("respects a custom maxLines override", () => {
    const big = `${Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n")}\n`;
    const r = truncateToolContent(big, { maxLines: 5 });
    expect(r.truncated).toBe(true);
    // outputLines == maxLines (5); totalLines comes from the source content
    expect(r.text).toMatch(/\[truncated: kept 5 of \d+ lines \(/);
    expect(r.text.startsWith("line 0\nline 1\n")).toBe(true);
  });
});
