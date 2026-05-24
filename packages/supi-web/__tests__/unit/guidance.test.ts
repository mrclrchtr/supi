import { describe, expect, it } from "vitest";
import {
  promptGuidelines as fetchPromptGuidelines,
  promptSnippet as fetchPromptSnippet,
  toolDescription as fetchToolDescription,
} from "../../src/tool/web-docs-fetch-guidance.ts";
import {
  promptGuidelines as searchPromptGuidelines,
  promptSnippet as searchPromptSnippet,
  toolDescription as searchToolDescription,
} from "../../src/tool/web-docs-search-guidance.ts";
import {
  buildPromptGuidelines,
  promptSnippet,
  toolDescription,
} from "../../src/tool/web-fetch-md-guidance.ts";

describe("supi-web guidance", () => {
  it("exports web_fetch_md prompt surfaces", () => {
    expect(toolDescription).toContain("Fetch a web page");
    expect(promptSnippet).toContain("web_fetch_md");

    const guidelines = buildPromptGuidelines();
    expect(guidelines.length).toBeLessThanOrEqual(4);
    expect(
      guidelines.every(
        (guideline) => guideline.includes("web_fetch_md") || guideline.includes("bash"),
      ),
    ).toBe(true);
  });

  it("exports Context7 prompt surfaces", () => {
    expect(searchToolDescription).toContain("Context7");
    expect(searchPromptSnippet).toContain("web_docs_search");
    expect(searchPromptGuidelines.every((guideline) => guideline.includes("web_docs_search"))).toBe(
      true,
    );
    expect(fetchToolDescription).toContain("Context7");
    expect(fetchPromptSnippet).toContain("web_docs_fetch");
    expect(
      fetchPromptGuidelines.every(
        (guideline) =>
          guideline.includes("web_docs_fetch") || guideline.includes("web_docs_search"),
      ),
    ).toBe(true);
  });
});
