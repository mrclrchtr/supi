import { describe, expect, it } from "vitest";
import { renderCall, renderResult } from "../../src/tool/render.ts";

const mockTheme = {
  fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
  bold: (text: string) => `*${text}*`,
};

describe("renderCall", () => {
  it("renders a compact task summary", () => {
    const result = renderCall({ tasks: [{ id: "t1", profile: "explore" }] }, mockTheme as never);
    expect(result).toBeDefined();
  });
});

describe("renderResult", () => {
  it("renders partial progress", () => {
    const result = renderResult(
      { details: { tasks: [], completedCount: 1, totalCount: 2 } },
      { expanded: false, isPartial: true },
      mockTheme as never,
    );
    expect(result).toBeDefined();
  });

  it("renders collapsed final with task status", () => {
    const result = renderResult(
      {
        details: {
          tasks: [
            {
              taskId: "t1",
              profileId: "explore",
              status: "completed",
              turns: 5,
              toolUses: 3,
              humanTruncated: false,
              modelTruncated: false,
            },
          ],
        },
      },
      { expanded: false, isPartial: false },
      mockTheme as never,
    );
    expect(result).toBeDefined();
  });

  it("renders expanded final with task details", () => {
    const result = renderResult(
      {
        details: {
          tasks: [
            {
              taskId: "t1",
              profileId: "explore",
              status: "completed",
              turns: 5,
              toolUses: 3,
              finalTextFull: "result text",
              humanTruncated: false,
              modelTruncated: false,
              usage: { totalTokens: 1000 },
            },
          ],
        },
      },
      { expanded: true, isPartial: false },
      mockTheme as never,
    );
    expect(result).toBeDefined();
  });

  it("renders error state", () => {
    const result = renderResult(
      { isError: true },
      { expanded: false, isPartial: false },
      mockTheme as never,
    );
    expect(result).toBeDefined();
  });
});
