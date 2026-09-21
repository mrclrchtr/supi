import { describe, expect, it } from "vitest";
import { formatSearchResults } from "../../src/tool/web_search/result.ts";

const introduction =
  "Source excerpts. Dates are provider-reported publication or modification dates.";

describe("web_search result format", () => {
  it("uses one introduction and keeps dates beside their sources", () => {
    const output = formatSearchResults([
      {
        title: "First source",
        url: "https://example.test/first",
        sourceDate: "2026-09-16",
        excerpts: ["First passage", "Second passage"],
      },
      {
        title: "Second source",
        url: "https://example.test/second",
        sourceDate: "2026-09-17",
        excerpts: ["Third passage"],
      },
    ]);

    expect(output).toBe(
      [
        introduction,
        "",
        "### [First source](<https://example.test/first>)",
        "Source date: 2026-09-16",
        "",
        "> First passage",
        "",
        "> Second passage",
        "",
        "### [Second source](<https://example.test/second>)",
        "Source date: 2026-09-17",
        "",
        "> Third passage",
      ].join("\n"),
    );
    expect(output.match(/provider-reported/g)).toHaveLength(1);
    expect(output).not.toContain("Source Excerpt");
  });

  it("preserves multiline content and separates excerpts with blank lines", () => {
    const excerpts = [
      "```ts\nconst greeting = 'こんにちは';\n```",
      "| Name | Count |\n| --- | --- |\n| Example | 17 |",
      '{"count":17,"enabled":false,"value":null}',
    ];
    const output = formatSearchResults([
      { title: "Structured content", url: "https://example.test/data", excerpts },
    ]);

    expect(output).toContain(
      [
        "> ```ts",
        "> const greeting = 'こんにちは';",
        "> ```",
        "",
        "> | Name | Count |",
        "> | --- | --- |",
        "> | Example | 17 |",
        "",
        '> {"count":17,"enabled":false,"value":null}',
      ].join("\n"),
    );
    expect(output).not.toContain("Source date:");
    expect(output).not.toContain("  >");
  });

  it("does not remove repeated or empty excerpts", () => {
    const output = formatSearchResults([
      {
        title: "Repeated passages",
        url: "https://example.test/repeated",
        excerpts: ["Same passage", "", "Same passage"],
      },
    ]);

    expect(output).toContain("> Same passage\n\n> \n\n> Same passage");
  });

  it("keeps the empty-search result unchanged", () => {
    expect(formatSearchResults([])).toBe("No web search sources found.");
  });
});
