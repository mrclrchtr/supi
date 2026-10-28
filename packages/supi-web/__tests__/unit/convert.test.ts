import { describe, expect, it } from "vitest";
import { htmlToMarkdown, wrapAsCodeBlock } from "../../src/convert.ts";

// biome-ignore lint/security/noSecrets: false positive on test describe name
describe("wrapAsCodeBlock", () => {
  it("wraps plain text in fenced code", () => {
    const result = wrapAsCodeBlock("hello world", "https://example.com/file.txt");
    expect(result).toContain("```\nhello world\n```");
  });

  it("uses language from URL extension", () => {
    const result = wrapAsCodeBlock("const x = 1;", "https://example.com/script.ts");
    expect(result).toContain("```ts\n");
  });

  it("handles backticks in content by using longer fence", () => {
    const result = wrapAsCodeBlock("code with `backticks`", "https://example.com/file.txt");
    expect(result).toContain("```\n");
    expect(result).toContain("```\n");
  });
});

describe("htmlToMarkdown", () => {
  it("converts simple HTML to markdown", async () => {
    const html = `
			<html><head><title>Test Page</title></head>
			<body><h1>Hello</h1><p>World</p></body></html>
		`;
    const result = await htmlToMarkdown(html, "https://example.com/page", { absLinks: false });
    expect(result).toContain("# Hello");
    expect(result).toContain("World");
  });

  it("preserves relative links and images when absolute links are disabled", async () => {
    const html = `
      <html><head><base href="https://cdn.example.com/docs/"></head><body>
      <h1>Guide</h1>
      <p>Read the <a href="./reference?mode=read#intro">reference</a>.</p>
      <p><img src="../images/diagram.png" alt="diagram"></p>
      </body></html>
    `;

    const result = await htmlToMarkdown(html, "https://example.com/page", { absLinks: false });

    expect(result).toContain("[reference](./reference?mode=read#intro)");
    expect(result).toContain("![diagram](../images/diagram.png)");
  });

  it("absolutizes relative links and images", async () => {
    const html = `
			<html><body>
			<a href="/path">relative</a>
			<a href="https://other.com/page">absolute</a>
      <img src="./diagram.png" alt="diagram">
			</body></html>
		`;
    const result = await htmlToMarkdown(html, "https://example.com/page", { absLinks: true });
    expect(result).toContain("https://example.com/path");
    expect(result).toContain("https://other.com/page");
    // biome-ignore lint/security/noSecrets: expected Markdown image, not a credential
    expect(result).toContain("![diagram](https://example.com/diagram.png)");
  });

  it("does not trust original-URL markers supplied by the page", async () => {
    const html = `
      <html><body><p>
      <a href="./reference" data-supi-original-url="https://other.example/forged">reference</a>
      <a data-supi-original-url="https://other.example/injected">plain text</a>
      </p></body></html>
    `;

    const result = await htmlToMarkdown(html, "https://example.com/page", { absLinks: false });

    expect(result).toContain("[reference](./reference)");
    expect(result).toContain("plain text");
    expect(result).not.toContain("other.example");
  });

  it.each([true, false])("filters unsafe URL schemes with absLinks=%s", async (absLinks) => {
    const html = `
      <html><body><h1>Guide</h1>
      <p>Safe content with an <a href="data:text/plain,unsafe">unsafe link</a>.</p>
      <img src="file:///private/diagram.png" alt="unsafe image">
      </body></html>
    `;

    const result = await htmlToMarkdown(html, "https://example.com/page", { absLinks });

    expect(result).toContain("Safe content");
    expect(result).toContain("unsafe link");
    expect(result).not.toContain("data:");
    expect(result).not.toContain("file:");
  });

  it("wraps plain text as code block", async () => {
    const text = "just some plain text content";
    const result = await htmlToMarkdown(text, "https://example.com/file.txt", { absLinks: false });
    expect(result).toContain("```");
    expect(result).toContain("just some plain text content");
  });

  it("removes script and style tags", async () => {
    const html = `
			<html><body>
			<h1>Title</h1>
			<script>alert('x')</script>
			<style>.x{color:red}</style>
			<p>Content</p>
			</body></html>
		`;
    const result = await htmlToMarkdown(html, "https://example.com/page", { absLinks: false });
    expect(result).toContain("Title");
    expect(result).toContain("Content");
    expect(result).not.toContain("alert");
    expect(result).not.toContain("color:red");
  });
});
