import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FETCH_TIMEOUT_MAX_MS,
  fetchWithNegotiation,
  guessLanguage,
  isHtml,
  isPlainTextContentType,
  isValidHttpUrl,
  looksLikeMarkdown,
} from "../../src/fetch.ts";

afterEach(() => vi.unstubAllGlobals());

function makeFetchThatRejectsOnAbort() {
  return vi.fn((_url: string | URL | Request, init?: RequestInit) => {
    const requestSignal = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      requestSignal?.addEventListener("abort", () => reject(requestSignal.reason), { once: true });
    });
  });
}

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
  });

  it("preserves HTTP status when no representation exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Not Found", { status: 404 })),
    );

    await expect(fetchWithNegotiation("https://example.com/missing")).rejects.toMatchObject({
      name: "FetchError",
      status: 404,
    });
  });

  it("uses an available Markdown sibling when the original page returns 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) =>
        String(url) === "https://example.com/guide.md"
          ? new Response("# Guide\n\nMarkdown source", {
              headers: { "content-type": "text/markdown" },
            })
          : new Response("Not Found", { status: 404 }),
      ),
    );

    await expect(fetchWithNegotiation("https://example.com/guide")).resolves.toMatchObject({
      url: "https://example.com/guide.md",
      text: "# Guide\n\nMarkdown source",
      isMarkdown: true,
    });
  });

  it("returns valid HTML when Markdown siblings return 404", async () => {
    // biome-ignore lint/security/noSecrets: static HTML fixture, not a credential
    const html = "<html><body>Guide</body></html>";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) =>
        String(url) === "https://example.com/guide"
          ? new Response(html, { headers: { "content-type": "text/html" } })
          : new Response("Not Found", { status: 404 }),
      ),
    );

    await expect(fetchWithNegotiation("https://example.com/guide")).resolves.toMatchObject({
      url: "https://example.com/guide",
      text: html,
      isMarkdown: false,
    });
  });

  it("honors an already-aborted signal without trying fallbacks", async () => {
    const controller = new AbortController();
    controller.abort();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.fn(async () => {
      throw abortError;
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithNegotiation("https://example.com/readme", { signal: controller.signal }),
    ).rejects.toThrow("Aborted");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps parent cancellation distinct from a timeout", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("The parent signal canceled the request.", "AbortError");
    vi.stubGlobal("fetch", makeFetchThatRejectsOnAbort());

    const pending = fetchWithNegotiation("https://example.com/readme", {
      signal: controller.signal,
    });
    controller.abort(abortError);

    await expect(pending).rejects.toBe(abortError);
  });

  it("reports request timeouts as FetchError", async () => {
    vi.stubGlobal("fetch", makeFetchThatRejectsOnAbort());

    await expect(
      fetchWithNegotiation("https://example.com/readme", { timeoutMs: 5 }),
    ).rejects.toMatchObject({
      name: "FetchError",
      message: "Fetch timed out after 5ms",
    });
  });

  it.each([-1, 1.5, FETCH_TIMEOUT_MAX_MS + 1])(
    "rejects unsupported timeout %s before fetching",
    async (timeoutMs) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        fetchWithNegotiation("https://example.com/readme", { timeoutMs }),
      ).rejects.toMatchObject({
        name: "FetchError",
        message: `Fetch timeout must be an integer from 0 through ${FETCH_TIMEOUT_MAX_MS}ms`,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

/** Build a minimal one-page-per-entry PDF; an empty entry is a page without text. */
function makePdf(pages: string[]): Uint8Array {
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  pages.forEach((text, i) => {
    const stream = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : "";
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  });
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, i) => {
    const offset = body.length;
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

function stubPdfResponse(body: Uint8Array, contentType = "application/pdf") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      init?.method === "HEAD"
        ? new Response(null, { headers: { "content-type": contentType } })
        : new Response(body.slice(), { headers: { "content-type": contentType } }),
    ),
  );
}

describe("fetchWithNegotiation with PDFs", () => {
  it("returns the text layer with a section per page", async () => {
    stubPdfResponse(makePdf(["First page text", "", "Third page text"]));

    const result = await fetchWithNegotiation("https://example.com/guide.pdf");

    expect(result.isMarkdown).toBe(true);
    expect(result.text).toBe("## Page 1\n\nFirst page text\n\n## Page 3\n\nThird page text");
  });

  it("detects a PDF served with a generic content type", async () => {
    stubPdfResponse(makePdf(["Generic type"]), "application/octet-stream");

    await expect(fetchWithNegotiation("https://example.com/download")).resolves.toMatchObject({
      text: "## Page 1\n\nGeneric type",
    });
  });

  it("fails when the PDF has no text layer", async () => {
    stubPdfResponse(makePdf([""]));

    await expect(fetchWithNegotiation("https://example.com/scan.pdf")).rejects.toMatchObject({
      name: "FetchError",
      message: expect.stringContaining("no text layer"),
    });
  });

  it("fails on an unreadable PDF instead of returning its bytes", async () => {
    stubPdfResponse(new TextEncoder().encode("%PDF-1.4 not a document"));

    await expect(fetchWithNegotiation("https://example.com/broken.pdf")).rejects.toMatchObject({
      name: "FetchError",
      message: expect.stringContaining("Could not read the PDF"),
    });
  });
});

describe("fetchWithNegotiation with other non-text content", () => {
  function stubBody(body: Uint8Array, contentType: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
        init?.method === "HEAD"
          ? new Response(null, { headers: { "content-type": contentType } })
          : new Response(body.slice(), { headers: { "content-type": contentType } }),
      ),
    );
  }

  it("returns image bytes for saving instead of decoding them as text", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    stubBody(png, "image/png");

    const result = await fetchWithNegotiation("https://example.com/logo");

    expect(result.text).toBe("");
    expect(result.image).toEqual({ data: png, mediaType: "image/png", extension: ".png" });
  });

  it.each([["application/zip"], ["text/plain"]])(
    "rejects binary content served as %s",
    async (contentType) => {
      stubBody(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0x08, 0]), contentType);

      await expect(fetchWithNegotiation("https://example.com/archive")).rejects.toMatchObject({
        name: "FetchError",
        message: expect.stringContaining("is binary content"),
      });
    },
  );
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
