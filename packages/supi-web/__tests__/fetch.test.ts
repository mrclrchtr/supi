import { describe, expect, it, vi } from "vitest";
import {
  FetchError,
  fetchWithNegotiation,
  isHtml,
  isValidHttpUrl,
  looksLikeMarkdown,
} from "../src/fetch.ts";

// biome-ignore lint/security/noSecrets: test describe name
describe("isValidHttpUrl", () => {
  it("accepts http URLs", () => {
    expect(isValidHttpUrl("http://example.com")).toBe(true);
  });

  it("accepts https URLs", () => {
    expect(isValidHttpUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("rejects non-http schemes", () => {
    expect(isValidHttpUrl("ftp://example.com")).toBe(false);
    expect(isValidHttpUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isValidHttpUrl("not a url")).toBe(false);
    expect(isValidHttpUrl("")).toBe(false);
  });
});

describe("isHtml", () => {
  it("detects HTML doctype", () => {
    expect(isHtml("<!DOCTYPE html><html></html>")).toBe(true);
  });

  it("detects html tag", () => {
    expect(isHtml("<html><body>hi</body></html>")).toBe(true);
  });

  it("detects head/body tags", () => {
    expect(isHtml("<head><title>x</title></head>")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(isHtml("just some text")).toBe(false);
  });

  it("returns false for markdown", () => {
    expect(isHtml("# Heading\n\nSome text.")).toBe(false);
  });
});

describe("looksLikeMarkdown", () => {
  it("detects headings", () => {
    expect(looksLikeMarkdown("# Hello")).toBe(true);
  });

  it("detects code fences", () => {
    expect(looksLikeMarkdown("```ts\nconst x = 1;\n```")).toBe(true);
  });

  it("detects lists", () => {
    expect(looksLikeMarkdown("- item\n- item")).toBe(true);
  });

  it("detects links", () => {
    expect(looksLikeMarkdown("[text](http://example.com)")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(looksLikeMarkdown("just plain text")).toBe(false);
  });
});

describe("fetchWithNegotiation", () => {
  it("returns markdown directly when HEAD indicates markdown", async () => {
    const mockResponse = (body: string, init: ResponseInit = {}): Response =>
      new Response(body, init);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        void _url;
        if (init?.method === "HEAD") {
          return mockResponse("", {
            status: 200,
            headers: { "content-type": "text/markdown; charset=utf-8" },
          });
        }
        return mockResponse("# Hello\n\nWorld", { status: 200 });
      }),
    );

    const result = await fetchWithNegotiation("https://example.com/readme");
    expect(result.isMarkdown).toBe(true);
    expect(result.text).toBe("# Hello\n\nWorld");

    vi.unstubAllGlobals();
  });

  it("throws FetchError on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Not Found", { status: 404 })),
    );

    await expect(fetchWithNegotiation("https://example.com/missing")).rejects.toThrow(FetchError);

    vi.unstubAllGlobals();
  });
});
