import { describe, expect, it } from "vitest";
import { parseBxResponse } from "../../src/tool/web_search/parse.ts";

function responseWithSnippets(snippets: unknown[]) {
  return {
    grounding: {
      generic: [
        {
          title: "Example source",
          url: "https://example.test/source",
          snippets,
        },
      ],
    },
  };
}

describe("web_search response parsing", () => {
  it.each([
    JSON.stringify({ rows: [{ name: "B", count: 17 }], columns: ["name", "count"] }),
    JSON.stringify({ count: 17, enabled: true, value: null }),
    "const total = 17;\nif (total > 0) return true;",
  ])("preserves a provider snippet string exactly: %s", (snippet) => {
    const parsed = parseBxResponse(responseWithSnippets([snippet]));

    expect(parsed.sources[0]?.excerpts).toEqual([snippet]);
  });

  it("rejects native snippet objects instead of flattening them", () => {
    expect(() =>
      parseBxResponse(responseWithSnippets([{ text: "This must not become an excerpt" }])),
    ).toThrow("malformed web search snippet");
  });

  it("fails the whole response when one required snippet is malformed", () => {
    expect(() => parseBxResponse(responseWithSnippets(["valid", 17]))).toThrow(
      "malformed web search snippet",
    );
  });
});
