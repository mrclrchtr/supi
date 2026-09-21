import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { renderWebSearchCall, renderWebSearchResult } from "../../src/tool/web_search/render.ts";

const theme = {
  fg: (_color: string, text: string) => text,
} as unknown as Theme;

type Renderable = { render: (width: number) => string[] };

type SearchResult = {
  content: Array<{ type: string; text?: string }>;
  details?: unknown;
};

function render(component: Renderable): string {
  return component.render(120).join("\n").trimEnd();
}

function result(details: unknown, text = "A source excerpt") {
  return { content: [{ type: "text", text }], details } satisfies SearchResult;
}

describe("web_search transcript renderer", () => {
  it("handles absent call arguments and truncates long queries", () => {
    const absent = render(renderWebSearchCall(undefined, theme));
    const longQuery = "long query ".repeat(10);
    const overlong = render(renderWebSearchCall({ query: longQuery, freshness: "pw" }, theme));

    expect(absent).toBe("web_search");
    expect(absent).not.toContain("undefined");
    expect(overlong).toContain("web_search");
    expect(overlong).toContain("pw");
    expect(overlong).toContain("…");
    expect(overlong).not.toContain(longQuery);
  });

  it("shows partial and error states", () => {
    const partial = render(
      renderWebSearchResult(result(undefined), { expanded: false, isPartial: true }, theme, {}),
    );
    const error = render(
      renderWebSearchResult(result(undefined), { expanded: false, isPartial: false }, theme, {
        isError: true,
      }),
    );

    expect(partial).toContain("Searching the web...");
    expect(error).toContain("Web search failed");
  });

  it.each([
    [0, "No web search sources found"],
    [1, "Found 1 source"],
    [2, "Found 2 sources"],
  ])("renders the %s-source summary", (sourceCount, summary) => {
    const output = render(
      renderWebSearchResult(
        result({ sourceCount, excerptCount: sourceCount }),
        { expanded: false, isPartial: false },
        theme,
      ),
    );

    expect(output).toContain(summary);
  });

  it("keeps one-source content collapsed and shows it when expanded", () => {
    const details = { sourceCount: 1, excerptCount: 1 };
    const collapsed = render(
      renderWebSearchResult(result(details), { expanded: false, isPartial: false }, theme),
    );
    const expanded = render(
      renderWebSearchResult(result(details), { expanded: true, isPartial: false }, theme),
    );

    expect(collapsed).toContain("expand for output");
    expect(collapsed).not.toContain("A source excerpt");
    expect(expanded).toContain("A source excerpt");
  });

  it("handles absent and malformed details without throwing", () => {
    const absent = render(
      renderWebSearchResult(
        result(undefined, "No details body"),
        { expanded: false, isPartial: false },
        theme,
      ),
    );
    const malformed = render(
      renderWebSearchResult(
        result({ sourceCount: "one", truncation: "invalid", fullOutputPath: 42 }),
        { expanded: true, isPartial: false },
        theme,
      ),
    );

    expect(absent).toContain("Web search finished");
    expect(absent).toContain("expand for output");
    expect(malformed).toContain("Web search finished");
    expect(malformed).toContain("A source excerpt");
    expect(malformed).not.toContain("42");
  });

  it("shows truncation and the full-output path in the expanded view", () => {
    const details = {
      sourceCount: 1,
      excerptCount: 1,
      truncation: { truncated: true },
      fullOutputPath: "/tmp/web-search-result.md",
    };
    const collapsed = render(
      renderWebSearchResult(result(details), { expanded: false, isPartial: false }, theme),
    );
    const expanded = render(
      renderWebSearchResult(result(details), { expanded: true, isPartial: false }, theme),
    );

    expect(collapsed).toContain("[truncated]");
    expect(collapsed).not.toContain("/tmp/web-search-result.md");
    expect(expanded).toContain("A source excerpt");
    expect(expanded).toContain("Full output: /tmp/web-search-result.md");
  });
});
