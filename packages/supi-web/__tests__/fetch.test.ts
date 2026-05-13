import { describe, expect, it, vi } from "vitest";
import {
  FetchError,
  fetchWithNegotiation,
  guessLanguage,
  isHtml,
  isPlainTextContentType,
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

describe("isPlainTextContentType", () => {
  it("returns true for text/plain", () => {
    expect(isPlainTextContentType("text/plain")).toBe(true);
  });

  it("returns true for text/csv", () => {
    expect(isPlainTextContentType("text/csv; charset=utf-8")).toBe(true);
  });

  it("returns true for application/xml", () => {
    expect(isPlainTextContentType("application/xml")).toBe(true);
  });

  it("returns false for text/html", () => {
    expect(isPlainTextContentType("text/html")).toBe(false);
  });

  it("returns false for text/html with charset", () => {
    expect(isPlainTextContentType("text/html; charset=utf-8")).toBe(false);
  });

  it("returns false for application/xhtml+xml", () => {
    expect(isPlainTextContentType("application/xhtml+xml")).toBe(false);
  });

  it("returns false for application/json", () => {
    expect(isPlainTextContentType("application/json")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isPlainTextContentType("")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isPlainTextContentType("TEXT/HTML")).toBe(false);
    expect(isPlainTextContentType("TEXT/PLAIN")).toBe(true);
  });
});

describe("guessLanguage", () => {
  it("returns empty string for unknown extension", () => {
    expect(guessLanguage("https://example.com/file.xyz")).toBe("");
  });

  it("returns empty string for URL without extension", () => {
    expect(guessLanguage("https://example.com/page")).toBe("");
  });

  it("detects python", () => {
    expect(guessLanguage("https://example.com/script.py")).toBe("python");
  });

  it("detects javascript", () => {
    expect(guessLanguage("https://example.com/app.js")).toBe("javascript");
  });

  it("detects cjs as javascript", () => {
    expect(guessLanguage("https://example.com/module.cjs")).toBe("javascript");
  });

  it("detects mjs as javascript", () => {
    expect(guessLanguage("https://example.com/module.mjs")).toBe("javascript");
  });

  it("detects typescript", () => {
    expect(guessLanguage("https://example.com/app.ts")).toBe("ts");
  });

  it("detects tsx", () => {
    expect(guessLanguage("https://example.com/component.tsx")).toBe("tsx");
  });

  it("detects jsx", () => {
    expect(guessLanguage("https://example.com/component.jsx")).toBe("jsx");
  });

  it("detects go", () => {
    expect(guessLanguage("https://example.com/main.go")).toBe("go");
  });

  it("detects rust", () => {
    expect(guessLanguage("https://example.com/lib.rs")).toBe("rust");
  });

  it("detects java", () => {
    expect(guessLanguage("https://example.com/Main.java")).toBe("java");
  });

  it("detects ruby", () => {
    expect(guessLanguage("https://example.com/app.rb")).toBe("ruby");
  });

  it("detects markdown", () => {
    expect(guessLanguage("https://example.com/README.md")).toBe("markdown");
  });

  it("detects html", () => {
    expect(guessLanguage("https://example.com/index.html")).toBe("html");
  });

  it("detects css", () => {
    expect(guessLanguage("https://example.com/style.css")).toBe("css");
  });

  it("detects scss", () => {
    expect(guessLanguage("https://example.com/style.scss")).toBe("scss");
  });

  it("detects sql", () => {
    expect(guessLanguage("https://example.com/query.sql")).toBe("sql");
  });

  it("detects kotlin", () => {
    expect(guessLanguage("https://example.com/app.kt")).toBe("kotlin");
  });

  it("detects yaml", () => {
    expect(guessLanguage("https://example.com/config.yaml")).toBe("yaml");
  });

  it("detects yml as yaml", () => {
    expect(guessLanguage("https://example.com/config.yml")).toBe("yaml");
  });

  it("detects toml", () => {
    expect(guessLanguage("https://example.com/config.toml")).toBe("toml");
  });

  it("detects json", () => {
    expect(guessLanguage("https://example.com/data.json")).toBe("json");
  });

  it("handles URLs with query strings", () => {
    expect(guessLanguage("https://example.com/main.py?raw=1")).toBe("python");
  });

  it("handles URLs with fragments", () => {
    expect(guessLanguage("https://example.com/script.py#L42")).toBe("python");
  });

  it("handles malformed URLs gracefully", () => {
    expect(guessLanguage("")).toBe("");
  });

  it("is case-insensitive", () => {
    expect(guessLanguage("https://example.com/Script.PY")).toBe("python");
  });
});
