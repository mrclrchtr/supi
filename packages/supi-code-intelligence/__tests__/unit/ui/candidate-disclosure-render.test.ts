import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { renderGraphResult } from "../../../src/tool/code_graph/tui.ts";
import { renderOrientationResult } from "../../../src/tool/code_orientation/tui.ts";
import { renderResolveResult } from "../../../src/tool/code_resolve/tui.ts";
import type { ToolResult } from "../../../src/ui/tui/common.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

function savedResult(key: string, partialMessage: string, withDisplay: boolean): ToolResult {
  const evidence = {
    key,
    completeness: "partial",
    shownCount: 1,
    totalCount: null,
    omittedCount: 0,
    partialReason: "provider-limited",
    partialMessage,
  };
  return JSON.parse(
    JSON.stringify({
      content: [{ type: "text", text: "Full provider reason remains in saved content." }],
      details: {
        type: "resolve",
        status: "disambiguation",
        message: "Choose a candidate.",
        data: {
          evidenceLists: [evidence],
          nextQueries: ["Choose one handle"],
          candidates: [
            {
              targetId: "tg-one",
              name: "Widget",
              kind: "Function",
              file: "a.ts",
              line: 1,
              character: 1,
              rank: 1,
            },
          ],
        },
        displaySections: withDisplay
          ? [
              {
                key,
                title: "Candidates",
                lines: ["tg-one — Widget"],
                evidence,
                displayOmittedCount: 0,
              },
            ]
          : undefined,
      },
    }),
  ) as ToolResult;
}

describe.each([
  { key: "resolve.candidates", render: renderResolveResult },
  { key: "orientation.candidates", render: renderOrientationResult },
  { key: "graph.candidates", render: renderGraphResult },
])("bounded provider reasons for $key", ({ key, render }) => {
  it.each([
    { name: "long", reason: "Provider detail ".repeat(1000) },
    { name: "multiline", reason: "Provider detail\n".repeat(100) },
  ])("limits a $name reason from saved details in both views", ({ reason }) => {
    for (const withDisplay of [false, true]) {
      const result = savedResult(key, reason, withDisplay);
      const saved = JSON.stringify(result);
      for (const expanded of [false, true]) {
        for (const width of [40, 120, 2000]) {
          const rows = render(result, { expanded, isPartial: false }, theme, undefined).render(
            width,
          );
          expect(rows.join("\n")).toContain("Provider reason limited");
          expect(rows.length).toBeLessThanOrEqual(expanded ? 25 : 10);
          expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);
        }
      }
      expect(JSON.stringify(result)).toBe(saved);
    }
  });
});
