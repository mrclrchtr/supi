import { describe, expect, it } from "vitest";
import { renderCall, renderResult } from "../../src/tool/agent_run/render.ts";

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

  it("renders collapsed final with task status, progress, and an output preview", () => {
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
              finalTextFull: "Found the caller.\nMore detail follows.",
              humanTruncated: false,
              modelTruncated: false,
              usage: { totalTokens: 1000 },
            },
          ],
          aggregateUsage: { totalTokens: 1000 },
        },
      },
      { expanded: false, isPartial: false },
      mockTheme as never,
    );
    const text = result.render(240).join("\n");

    expect(text).toContain("Agent Run finished");
    expect(text).toContain("1 completed");
    expect(text).toContain("1,000 tokens");
    expect(text).toContain("Found the caller.");
  });

  it("renders expanded final with task details and the result body", () => {
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
              finalTextFull: "## Findings\n\nThe caller is in `src/index.ts`.",
              humanTruncated: false,
              modelTruncated: false,
              usage: { totalTokens: 1000 },
            },
          ],
          aggregateUsage: { totalTokens: 1000 },
        },
      },
      { expanded: true, isPartial: false },
      mockTheme as never,
    );
    const text = result.render(240).join("\n");

    expect(text).toContain("Agent Run finished");
    expect(text).toContain("Findings");
    expect(text).toContain("src/index.ts");
    expect(text).toContain("1,000 tokens");
  });

  it("renders error state from PI's renderer context", () => {
    const result = renderResult(
      { content: [{ type: "text", text: "Provider rejected the request\nDetails omitted" }] },
      { expanded: false, isPartial: false },
      mockTheme as never,
      { isError: true },
    );
    const text = result.render(240).join("\n");
    const expanded = renderResult(
      { content: [{ type: "text", text: "Provider rejected the request\nDetails omitted" }] },
      { expanded: true, isPartial: false },
      mockTheme as never,
      { isError: true },
    );
    const expandedText = expanded.render(240).join("\n");

    expect(text).toContain("Agent Run failed: Provider rejected the request");
    expect(expandedText).toContain("Details omitted");
  });
});
