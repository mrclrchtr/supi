import { stripVTControlCharacters } from "node:util";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, it } from "vitest";
import { renderGraphResult } from "../../../src/tool/code_graph/tui.ts";
import { renderOrientationResult } from "../../../src/tool/code_orientation/tui.ts";
import { renderResolveResult } from "../../../src/tool/code_resolve/tui.ts";
import type { ToolResult } from "../../../src/ui/tui/common.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

const ORIENTATION_GUIDANCE = "Use one candidate handle as focus.target.handle";
const RESOLVE_GUIDANCE = "Choose one candidate handle, or narrow the symbol selector";

beforeAll(() => initTheme("dark"));

function legacyOrientationResult(content: unknown[]): ToolResult {
  return {
    content: content as ToolResult["content"],
    details: {
      type: "context",
      status: "completed",
      data: {
        confidence: "semantic",
        evidenceLists: [
          {
            key: "orientation.candidates",
            shownCount: 1,
            totalCount: 2,
            omittedCount: 1,
            partialReason: null,
          },
        ],
        nextQueries: [ORIENTATION_GUIDANCE],
      },
      displaySections: [
        {
          key: "orientation.candidates",
          title: "Candidates",
          lines: [
            "1. renderGraphResult (Function) — packages/supi-code-intelligence/src/tool/code_graph/markdown.ts:16:17 [tg-old]",
          ],
          shownCount: 1,
          totalCount: 2,
          omittedCount: 1,
          partialReason: null,
        },
      ],
    },
  };
}

function renderLegacyOrientation(result: ToolResult, width = 160): string {
  return stripVTControlCharacters(
    renderOrientationResult(result, { expanded: true, isPartial: false }, theme, { isError: false })
      .render(width)
      .join("\n"),
  );
}

describe("legacy candidate fallback rendering", () => {
  it("retains the old Orientation reason and appends structured guidance once", () => {
    const result = legacyOrientationResult([
      {
        type: "text",
        text:
          "# No Orientation target matched provider kind `class`\n\n" +
          "1. **renderGraphResult** (`Function`) — `packages/supi-code-intelligence/src/tool/code_graph/markdown.ts`:16:17 — `tg-old`\n\n" +
          "_(showing 1 of 2; 1 omitted)_",
      },
    ]);

    const text = renderLegacyOrientation(result);

    expect(text).toContain("No Orientation target matched provider kind");
    expect(text).toContain("class");
    expect(text.match(new RegExp(ORIENTATION_GUIDANCE, "g"))).toHaveLength(1);
    expect(text.match(/1 of 2/g)).toHaveLength(1);
    expect(text).not.toContain("Candidates (1 of 2");
  });

  it("skips null, non-text, and invalid-text blocks in the old body", () => {
    const result = legacyOrientationResult([
      null,
      { type: "image", text: "This non-text block must not appear." },
      { type: "text", text: null },
      { type: "text", text: 42 },
      { type: "text", text: "# Valid legacy candidate body" },
    ]);

    expect(() => renderLegacyOrientation(result)).not.toThrow();
    const text = renderLegacyOrientation(result);
    expect(text).toContain("Valid legacy candidate body");
    expect(text).not.toContain("This non-text block must not appear.");
  });

  it("bounds the old body at 40 rows and 4096 source characters", () => {
    const longBody = [
      "# No Orientation target matched provider kind `class`",
      "",
      ...Array.from(
        { length: 500 },
        (_, index) => `legacy body line ${index} with several words for wrapping at narrow widths`,
      ),
    ].join("\n");
    const result = legacyOrientationResult([{ type: "text", text: longBody }]);
    if (!result.details) throw new Error("Expected details");
    result.details.truncation = {
      truncated: false,
      displayTruncated: true,
      fullOutputPath: "/tmp/legacy-candidate-full-output.txt",
    };
    const beforeRender = structuredClone(result);
    const component = renderOrientationResult(result, { expanded: true, isPartial: false }, theme, {
      isError: false,
    });

    for (const width of [40, 80, 120]) {
      const rows = component.render(width);
      const text = stripVTControlCharacters(rows.join("\n"));
      const normalizedText = text.replace(/\s+/g, " ");
      expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);
      expect(rows.length).toBeLessThanOrEqual(50);
      expect(normalizedText).toContain("Legacy candidate body truncated for display");
      expect(normalizedText).toContain("4096");
      expect(normalizedText).toContain("40 rows");
      expect(text).toContain("/tmp/legacy-candidate-full-output.txt");
    }

    const firstRender = component.render(80);
    component.invalidate();
    expect(component.render(80)).toEqual(firstRender);
    expect(result).toEqual(beforeRender);
  });

  it("does not invent Orientation guidance when structured guidance is absent", () => {
    const result = legacyOrientationResult([
      { type: "text", text: "# No Orientation target matched provider kind `class`" },
    ]);
    if (!result.details) throw new Error("Expected details");
    result.details.data.nextQueries = [];

    const text = renderLegacyOrientation(result);

    expect(text).not.toContain(ORIENTATION_GUIDANCE);
  });

  it.each([
    {
      name: "Graph",
      guidance: RESOLVE_GUIDANCE,
      render: renderGraphResult,
      type: "search",
      key: "graph.candidates",
      body: `# Target is ambiguous\n\n${RESOLVE_GUIDANCE}`,
    },
    {
      name: "Resolve",
      guidance: RESOLVE_GUIDANCE,
      render: renderResolveResult,
      type: "resolve",
      key: "resolve.candidates",
      body: `# Target is ambiguous\n\n${RESOLVE_GUIDANCE}`,
    },
  ])("does not duplicate old $name selection guidance", (case_) => {
    const evidence = {
      key: case_.key,
      shownCount: 1,
      totalCount: 2,
      omittedCount: 1,
      partialReason: null,
    };
    const result: ToolResult = {
      content: [{ type: "text", text: case_.body }],
      details: {
        type: case_.type,
        status: "disambiguation",
        data: {
          confidence: "semantic",
          evidenceLists: [evidence],
          nextQueries: [case_.guidance],
        },
        displaySections: [
          {
            ...evidence,
            title: "Candidates",
            lines: ["candidate row"],
          },
        ],
      },
    };

    const text = stripVTControlCharacters(
      case_
        .render(result, { expanded: true, isPartial: false }, theme, { isError: false })
        .render(160)
        .join("\n"),
    );

    expect(text.match(new RegExp(case_.guidance, "g"))).toHaveLength(1);
  });
});
