import { initTheme } from "@earendil-works/pi-coding-agent";
import { beforeAll, describe, expect, it } from "vitest";
import { renderGraphResult } from "../../../src/tool/code_graph/tui.ts";

const testTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

beforeAll(() => initTheme("dark"));

describe("code_graph result rendering", () => {
  it.each([false, true])(
    "discloses invalid provider locations from structured details when expanded=%s",
    (expanded) => {
      const component = renderGraphResult(
        {
          content: [{ type: "text", text: "" }],
          details: {
            type: "search",
            data: {
              candidateCount: 2,
              omittedCount: 1,
              confidence: "semantic",
              evidenceLists: [
                {
                  key: "references.locations",
                  totalCount: 2,
                  shownCount: 1,
                  omittedCount: 1,
                  partialReason: "invalid-provider-location",
                  invalidLocationCount: 2,
                },
              ],
            },
          },
        },
        { expanded, isPartial: false },
        testTheme,
        undefined,
      );

      expect(component.render(160).join("\n")).toContain(
        "1 of 2 references (1 omitted); 2 invalid provider locations omitted — invalid-provider-location",
      );
    },
  );
});
