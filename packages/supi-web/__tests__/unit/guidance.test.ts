import { describe, expect, it } from "vitest";
import {
  fetchPromptGuidelines,
  fetchPromptSnippet,
  fetchToolDescription,
  searchPromptGuidelines,
  searchPromptSnippet,
  searchToolDescription,
} from "../../src/tool/docs-guidance.ts";
import { buildPromptGuidelines, promptSnippet, toolDescription } from "../../src/tool/guidance.ts";

describe("supi-web guidance", () => {
  it("exports web_fetch_md prompt surfaces", () => {
    expect(toolDescription).toContain("Fetch a web page");
    expect(promptSnippet).toContain("web_fetch_md");

    const guidelines = buildPromptGuidelines();
    expect(guidelines.length).toBeGreaterThanOrEqual(4);
    expect(guidelines[0]).toContain("web_fetch_md");
  });

  it("exports Context7 prompt surfaces", () => {
    expect(searchToolDescription).toContain("Context7");
    expect(searchPromptSnippet).toContain("web_docs_search");
    expect(searchPromptGuidelines[0]).toContain("web_docs_search");
    expect(fetchToolDescription).toContain("Context7");
    expect(fetchPromptSnippet).toContain("web_docs_fetch");
    expect(fetchPromptGuidelines[0]).toContain("web_docs_fetch");
  });
});
