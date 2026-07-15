import { initTheme } from "@earendil-works/pi-coding-agent";
import { beforeAll, describe, expect, it } from "vitest";
import { renderFindResult } from "../../../src/tool/find/tui.ts";

const testTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

beforeAll(() => initTheme("dark"));

function render(data: Record<string, unknown>, expanded: boolean, content = ""): string {
  return renderFindResult(
    {
      content: [{ type: "text", text: content }],
      details: { type: "search", data },
    },
    { expanded, isPartial: false },
    testTheme,
    undefined,
  )
    .render(120)
    .join("\n");
}

describe("code_find result rendering", () => {
  it.each([
    "heuristic",
    "structural",
    "semantic",
  ] as const)("exposes %s confidence from structured details", (confidence) => {
    expect(render({ candidateCount: 1, omittedCount: 0, confidence }, false)).toContain(
      `confidence ${confidence}`,
    );
  });

  it.each([
    {
      label: "known truncation",
      evidence: {
        key: "find.textMatches",
        totalCount: 3,
        shownCount: 1,
        omittedCount: 2,
        partialReason: null,
      },
      markdown: "_(showing 1 of 3; 2 omitted)_",
      renderedMarkdown: "showing 1 of 3; 2 omitted",
      badge: "1 of 3 matches (2 omitted)",
    },
    {
      label: "unknown partial evidence",
      evidence: {
        key: "find.textMatches",
        totalCount: null,
        shownCount: 1,
        omittedCount: null,
        partialReason: "timeout",
      },
      markdown: "_(showing 1; more may exist — timeout)_",
      renderedMarkdown: "showing 1; more may exist — timeout",
      badge: "1 matches (more may exist — timeout)",
    },
  ])("projects $label from serialized evidence in compact and expanded views", ({
    evidence,
    markdown,
    renderedMarkdown,
    badge,
  }) => {
    for (const expanded of [false, true]) {
      const text = render(
        {
          candidateCount: 99,
          confidence: "heuristic",
          evidenceLists: [evidence],
          omittedCount: 98,
        },
        expanded,
        markdown,
      );

      expect(text).toContain(badge);
      if (expanded) expect(text).toContain(renderedMarkdown);
    }
  });
});
