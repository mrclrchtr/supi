import { readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { completedCodeQuery, unavailableCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { describe, expect, it } from "vitest";
import { finishInspectResult } from "../../../../src/tool/code_inspect/result.ts";
import { boundCodeToolResult, truncateToolContent } from "../../../../src/tool/infra/truncate.ts";

describe("model output budget", () => {
  it("reserves diagnostic space when long reasons would exhaust the summary allowance", () => {
    const reason = `Detailed provider limitation.\n${"\n".repeat(3000)}`;
    const diagnostic = `Late diagnostic must stay visible. ${"More diagnostic context. ".repeat(100)}`;
    const raw = finishInspectResult({
      kind: "completed",
      nextQueries: [],
      data: {
        relPath: `src/${"nested/".repeat(100)}widget.ts`,
        line: 1,
        character: 1,
        maxResults: 5,
        confidence: "semantic",
        diagnosticWindow: { startLine: 1, endLine: 3 },
        sections: {
          node: { kind: "partial", data: null, reason },
          enclosingSymbol: { kind: "partial", data: null, reason },
          hover: { kind: "partial", data: "Long documentation. ".repeat(2000), reason },
          definition: { kind: "partial", data: [], reason },
          diagnostics: {
            kind: "partial",
            reason,
            data: [
              {
                line: 2,
                character: 1,
                endLine: 2,
                endCharacter: 4,
                severity: 1,
                message: diagnostic,
              },
            ],
          },
        },
      },
    });
    const result = boundCodeToolResult(raw.content, raw.details, { toolName: "code_inspect" });
    const snapshot = result.details?.truncation?.fullOutputPath;
    expect(snapshot).toBeDefined();
    try {
      const text = result.content[0].text;
      expect(text.length).toBeLessThanOrEqual(8000);
      expect(text).toContain("Diagnostic L2:1");
      expect(text).toContain("Late diagnostic must stay visible");
      expect(text).toContain("diagnostics: partial");
      expect(text).toContain("total=unknown");
    } finally {
      if (snapshot) rmSync(dirname(snapshot), { recursive: true, force: true });
    }
  });

  it("keeps late diagnostics and section limitations ahead of a large hover preview", () => {
    const raw = finishInspectResult({
      kind: "completed",
      nextQueries: [],
      data: {
        relPath: "src/widget.ts",
        line: 1,
        character: 1,
        maxResults: 5,
        confidence: "semantic",
        diagnosticWindow: { startLine: 1, endLine: 3 },
        sections: {
          node: completedCodeQuery(null),
          enclosingSymbol: completedCodeQuery(null),
          hover: completedCodeQuery("Long documentation. ".repeat(2000)),
          definition: unavailableCodeQuery("Definition lookup unavailable"),
          diagnostics: {
            kind: "partial",
            reason: "Ambient evidence only",
            data: [
              {
                line: 2,
                character: 1,
                endLine: 2,
                endCharacter: 4,
                severity: 1,
                message: "Late diagnostic must stay visible",
              },
            ],
          },
        },
      },
    });
    const result = boundCodeToolResult(raw.content, raw.details, { toolName: "code_inspect" });
    const text = result.content[0].text;
    const snapshot = result.details?.truncation?.fullOutputPath;
    expect(snapshot).toBeDefined();
    try {
      expect(text.length).toBeLessThanOrEqual(8000);
      expect(text).toContain("src/widget.ts:1:1");
      expect(text).toContain("Late diagnostic must stay visible");
      expect(text).toContain("Ambient evidence only");
      expect(text).toContain("Definition lookup unavailable");
      expect(text.indexOf("Late diagnostic must stay visible")).toBeLessThan(
        text.indexOf("Long documentation"),
      );
      expect(result.details?.truncation?.truncated).toBe(true);
      expect(result.details?.data).toEqual(raw.details?.data);
      expect(readFileSync(snapshot as string, "utf8")).toBe(raw.content);
    } finally {
      if (snapshot) rmSync(dirname(snapshot), { recursive: true, force: true });
    }
  });
});

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
