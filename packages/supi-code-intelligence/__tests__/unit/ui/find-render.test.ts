import { describe, expect, it } from "vitest";
import { renderFindResult } from "../../../src/tool/find/tui.ts";

const testTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

describe("code_find compact result rendering", () => {
  it.each([
    "heuristic",
    "structural",
    "semantic",
  ] as const)("exposes %s confidence from structured details", (confidence) => {
    const rendered = renderFindResult(
      {
        content: [{ type: "text", text: "" }],
        details: {
          type: "search",
          data: { candidateCount: 1, omittedCount: 0, confidence },
        },
      },
      { expanded: false, isPartial: false },
      testTheme,
      undefined,
    );

    expect(rendered.render(120).join("\n")).toContain(`confidence ${confidence}`);
  });
});
