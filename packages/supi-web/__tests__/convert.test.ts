import { describe, expect, it } from "vitest";
import { htmlToMarkdown, wrapAsCodeBlock } from "../src/convert.ts";

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

  it("absolutizes relative links", async () => {
    const html = `
			<html><body>
			<a href="/path">relative</a>
			<a href="https://other.com/page">absolute</a>
			</body></html>
		`;
    const result = await htmlToMarkdown(html, "https://example.com/page", { absLinks: true });
    expect(result).toContain("https://example.com/path");
    expect(result).toContain("https://other.com/page");
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
