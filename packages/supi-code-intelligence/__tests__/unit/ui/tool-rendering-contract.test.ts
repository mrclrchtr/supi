import { initTheme } from "@earendil-works/pi-coding-agent";
import { beforeAll, describe, expect, it } from "vitest";
import { renderFindResult } from "../../../src/tool/find/tui.ts";
import { renderResolveCall } from "../../../src/tool/resolve/tui.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

beforeAll(() => initTheme("dark"));

describe("Code Intelligence tool rendering contract", () => {
  it("uses context.isError for execution failures", () => {
    const rendered = renderFindResult(
      {
        content: [{ type: "text", text: "model output" }],
        details: {
          type: "search",
          data: { confidence: "semantic" },
        },
      },
      { expanded: false, isPartial: false },
      theme,
      { isError: true },
    );

    expect(rendered.render(120).join("\n")).toContain("Tool failed");
  });

  it("renders domain errors and structured expanded rows", () => {
    const rendered = renderFindResult(
      {
        content: [{ type: "text", text: "**Error:** Fix the query" }],
        details: {
          type: "search",
          status: "invalid-input",
          message: "Fix the query",
          data: { confidence: "unavailable" },
          displaySections: [
            {
              key: "find.error",
              title: "Reason",
              lines: ["The query is invalid"],
              shownCount: 1,
              totalCount: 1,
              omittedCount: 0,
              partialReason: null,
            },
          ],
        },
      },
      { expanded: true, isPartial: false },
      theme,
      { isError: false },
    );

    const text = rendered.render(120).join("\n");
    expect(text).toContain("Invalid input: Fix the query");
    expect(text).toContain("The query is invalid");
  });

  it("keeps incomplete call arguments safe and bounded", () => {
    expect(() => renderResolveCall({}, theme, undefined)).not.toThrow();
    const rendered = renderResolveCall(
      {
        target: {
          symbol: {
            query: "a".repeat(200),
          },
        },
      },
      theme,
      undefined,
    );

    expect(rendered.render(120).join("\n").length).toBeLessThan(130);
  });
});
