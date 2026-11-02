import { mkdtempSync, rmSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { inspect } from "node:util";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@earendil-works/pi-coding-agent";
import { writeSupiConfig } from "@mrclrchtr/supi-core/config";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { runWebFetch } from "../../src/tool/web_fetch_md/execute.ts";
import type { WebFetchMdOutput } from "../../src/tool/web_fetch_md/result-schema.ts";
import webExtension from "../../src/web.ts";
import { expectStructuredContent } from "../helpers/structured-result.ts";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup }));

const sourceUrl = "https://example.com/article";
const apiUrl = "https://api.firecrawl.dev/v2/scrape";
let cwd: string;
const markdown =
  "# Article\n\nPublic source content.\n\nA footer mentioning reCAPTCHA is not an access block.";

function providerPage(title: string | string[] = "Article") {
  return {
    success: true,
    data: {
      markdown,
      warning: null,
      metadata: {
        title,
        sourceURL: sourceUrl,
        statusCode: 200,
        cacheState: "hit",
        cachedAt: "2026-10-31T05:30:02.440Z",
      },
    },
  };
}

function registerTool() {
  const pi = createPiMock();
  webExtension(pi as never);
  return pi.tools[0] as {
    execute: typeof runWebFetch;
    outputSchema: unknown;
    renderResult: (...args: unknown[]) => { render: (width: number) => string[] };
  };
}

function execute(input: Record<string, unknown> = {}, signal?: AbortSignal) {
  return registerTool().execute(
    "fallback",
    { url: sourceUrl, fetch_mode: "firecrawl_fallback", ...input },
    signal,
    undefined,
    makeCtx({ cwd }) as never,
  );
}

function stubRequests(provider: () => Response | Promise<Response>, status = 403) {
  const requests = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
    String(url) === apiUrl
      ? provider()
      : new Response("Direct fetch failed", { status, statusText: "Fixture failure" }),
  );
  vi.stubGlobal("fetch", requests);
  return requests;
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "supi-firecrawl-"));
  writeSupiConfig({ section: "web", scope: "project", cwd }, { firecrawlEnabled: true });
  vi.stubEnv("FIRECRAWL_API_KEY", "fixture-key");
  vi.mocked(lookup).mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("agent-selected Firecrawl retrieval", () => {
  it.each(["firecrawl", "firecrawl_fallback"])(
    "blocks %s while disabled, then honors settings changes on the next call",
    async (fetch_mode) => {
      const requests = stubRequests(() => Response.json(providerPage()));
      writeSupiConfig({ section: "web", scope: "project", cwd }, { firecrawlEnabled: false });
      await expect(execute({ fetch_mode })).rejects.toThrow(/disabled.*supi-settings/i);
      expect(requests).not.toHaveBeenCalled();
      expect(lookup).not.toHaveBeenCalled();
      writeSupiConfig({ section: "web", scope: "project", cwd }, { firecrawlEnabled: true });
      expect((await execute({ fetch_mode })).structuredContent).toMatchObject({ markdown });
    },
  );

  it("fetches with Firecrawl immediately without probing a JS-rendered source", async () => {
    const requests = stubRequests(() => Response.json(providerPage(["Article", "Site"])));
    const result = await execute({ fetch_mode: "firecrawl" });
    expect(result.structuredContent).toMatchObject({
      markdown,
      retrieval: { provider: "firecrawl" },
    });
    expect(requests.mock.calls.map(([url]) => String(url))).toEqual([apiUrl]);
  });
  it.each(["inline", "file"])(
    "preserves source, Markdown, and retrieval provenance in %s results",
    async (output_mode) => {
      const requests = stubRequests(() => Response.json(providerPage()));
      const tool = registerTool();
      const result = await tool.execute(
        "fallback",
        { url: sourceUrl, fetch_mode: "firecrawl_fallback", output_mode },
        undefined,
        undefined,
        makeCtx({ cwd }) as never,
      );
      const data = expectStructuredContent<WebFetchMdOutput>(tool, result);
      expect(data).toMatchObject({
        mode: output_mode,
        url: sourceUrl,
        chars: markdown.length,
        retrieval: {
          provider: "firecrawl",
          cacheState: "hit",
          cachedAt: "2026-10-31T05:30:02.440Z",
        },
      });
      expect(result.content[0]).toMatchObject({ text: expect.stringContaining("Firecrawl") });
      expect(result.content[0]).toMatchObject({ text: expect.stringContaining("cache: hit") });
      expect(result.content[0]).toMatchObject({ text: expect.stringContaining(sourceUrl) });
      const rendered = tool
        .renderResult(
          result,
          { expanded: false, isPartial: false },
          { fg: (_: string, text: string) => text },
        )
        .render(160)
        .join("\n");
      expect(rendered).toContain("Firecrawl");
      expect(JSON.stringify(result)).not.toContain("fixture-key");
      if (data.mode === "file") {
        try {
          expect(await readFile(data.filePath, "utf8")).toBe(markdown);
          expect(data).not.toHaveProperty("markdown");
        } finally {
          await rm(dirname(data.filePath), { recursive: true, force: true });
        }
      } else {
        expect(data.markdown).toBe(markdown);
      }
      const providerCalls = requests.mock.calls.filter(([url]) => String(url) === apiUrl);
      expect(providerCalls).toHaveLength(1);
      const init = providerCalls[0][1];
      expect(init).toMatchObject({
        method: "POST",
        redirect: "error",
        headers: { Authorization: "Bearer fixture-key", "Content-Type": "application/json" },
      });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        url: sourceUrl,
        formats: ["markdown"],
        onlyMainContent: true,
      });
    },
  );

  it.each([
    [500, 1_000],
    [300_001, 300_000],
  ])("honors a %s ms local budget with a valid provider timeout", async (timeout_ms, timeout) => {
    const requests = stubRequests(() => Response.json(providerPage()));
    const result = await execute({ timeout_ms });
    expect(result.structuredContent).toMatchObject({ markdown });
    const call = requests.mock.calls.find(([url]) => String(url) === apiUrl);
    expect(call).toBeDefined();
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ timeout });
  });

  it.each(["cacheState", "cachedAt"] as const)(
    "rejects oversized provider %s metadata even in file mode",
    async (field) => {
      const page = providerPage();
      page.data.metadata[field] = "x".repeat(60_000);
      stubRequests(() => Response.json(page));
      await expect(execute({ output_mode: "file" })).rejects.toThrow(/Firecrawl.*invalid response/);
    },
  );

  it("bounds file-mode attribution while retaining the file pointer and complete structured URL", async () => {
    const url = `${sourceUrl}/${"x".repeat(60_000)}`;
    stubRequests(() => Response.json(providerPage()));
    const tool = registerTool();
    const result = await tool.execute(
      "long-url",
      { url, fetch_mode: "firecrawl_fallback", output_mode: "file" },
      undefined,
      undefined,
      makeCtx({ cwd }) as never,
    );
    const data = expectStructuredContent<WebFetchMdOutput>(tool, result);
    expect(data.mode).toBe("file");
    if (data.mode !== "file") throw new Error("Expected file delivery");
    try {
      const text = result.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("\n");
      expect(Buffer.byteLength(text)).toBeLessThanOrEqual(DEFAULT_MAX_BYTES);
      expect(text.split("\n").length).toBeLessThanOrEqual(DEFAULT_MAX_LINES);
      expect(text).toContain(data.filePath);
      expect(text).toContain("Firecrawl");
      expect(text).toContain(sourceUrl);
      expect(data.url).toBe(url);
      expect(await readFile(data.filePath, "utf8")).toBe(markdown);
    } finally {
      await rm(dirname(data.filePath), { recursive: true, force: true });
    }
  });

  it.each([true, false])(
    "tailors direct 403 guidance to firecrawlEnabled=%s without sharing the URL",
    async (firecrawlEnabled) => {
      writeSupiConfig({ section: "web", scope: "project", cwd }, { firecrawlEnabled });
      vi.stubEnv("FIRECRAWL_API_KEY", undefined);
      const requests = stubRequests(() => Response.json(providerPage()));
      const failure = execute({ fetch_mode: undefined });
      await expect(failure).rejects.toMatchObject({
        status: 403,
        message: expect.stringContaining('fetch_mode: "firecrawl_fallback"'),
        cause: expect.objectContaining({ status: 403 }),
      });
      await expect(failure).rejects.toThrow(/shares the URL and may consume credits/);
      if (firecrawlEnabled) {
        await expect(failure).rejects.not.toThrow(/supi-settings|FIRECRAWL_API_KEY/);
      } else {
        await expect(failure).rejects.toThrow(/supi-settings.*FIRECRAWL_API_KEY/);
      }
      expect(requests.mock.calls.some(([url]) => String(url) === apiUrl)).toBe(false);
      expect(lookup).not.toHaveBeenCalled();
    },
  );

  it("does not need credentials or DNS checks when direct fetching succeeds", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", undefined);
    const requests = vi.fn(
      async (_url: unknown, init?: RequestInit) =>
        new Response(init?.method === "HEAD" ? null : markdown, {
          headers: { "content-type": "text/markdown" },
        }),
    );
    vi.stubGlobal("fetch", requests);
    const result = await execute();
    expect(result.structuredContent).toMatchObject({ markdown });
    expect(result.structuredContent).not.toHaveProperty("retrieval");
    expect(requests.mock.calls.some(([url]) => String(url) === apiUrl)).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each([401, 404, 429, 500])("does not fall back after HTTP %s", async (status) => {
    const requests = stubRequests(() => Response.json(providerPage()), status);
    await expect(execute()).rejects.toMatchObject({ status });
    expect(requests.mock.calls.some(([url]) => String(url) === apiUrl)).toBe(false);
  });

  it("reports missing credentials without contacting the provider", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", undefined);
    const requests = stubRequests(() => Response.json(providerPage()));
    await expect(execute()).rejects.toThrow("FIRECRAWL_API_KEY");
    expect(requests.mock.calls.some(([url]) => String(url) === apiUrl)).toBe(false);
  });

  it("rejects an unsupported fetch mode before making requests", async () => {
    const requests = stubRequests(() => Response.json(providerPage()));
    await expect(execute({ fetch_mode: "unknown" })).rejects.toThrow("fetch_mode");
    expect(requests).not.toHaveBeenCalled();
  });

  it.each([
    "http://localhost/article",
    "http://intranet/article",
    "http://service.local/article",
    "http://127.0.0.1/article",
    "http://10.0.0.1/article",
    "http://100.64.0.1/article",
    "http://169.254.169.254/article",
    "http://192.168.1.1/article",
    "http://[::1]/article",
    "http://[::ffff:127.0.0.1]/article",
    "http://[fc00::1]/article",
    // biome-ignore lint/security/noSecrets: deliberately credential-bearing URL fixture
    "https://user:password@example.com/article",
  ])("does not send a non-public or credential-bearing target to Firecrawl: %s", async (url) => {
    const requests = stubRequests(() => Response.json(providerPage()));
    await expect(execute({ url })).rejects.toThrow(/public|credentials/i);
    expect(requests.mock.calls.some(([requestUrl]) => String(requestUrl) === apiUrl)).toBe(false);
  });

  it("rejects a hostname with any private DNS address", async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
    const requests = stubRequests(() => Response.json(providerPage()));
    await expect(execute()).rejects.toThrow(/public/i);
    expect(requests.mock.calls.some(([url]) => String(url) === apiUrl)).toBe(false);
  });

  it("preserves troubleshooting documentation with access-error subsection headings", async () => {
    const page = providerPage("HTTP troubleshooting");
    page.data.markdown =
      "# HTTP troubleshooting\n\n## 403 Forbidden\n\nCheck the resource permissions.";
    stubRequests(() => Response.json(page));

    const result = await execute();
    expect(result.structuredContent).toMatchObject({ markdown: page.data.markdown });
  });

  it("accepts nonempty Firecrawl Markdown with page status 304", async () => {
    const page = providerPage();
    page.data.metadata.statusCode = 304;
    stubRequests(() => Response.json(page));

    const result = await execute();
    expect(result.structuredContent).toMatchObject({
      markdown,
      retrieval: { provider: "firecrawl", cacheState: "hit" },
    });
  });

  it.each([
    { success: false, error: "Provider failure" },
    { success: true, data: {} },
    { success: true, data: { markdown: "   " } },
    { success: true, data: { markdown, warning: "Content may be incomplete" } },
    { success: true, data: { markdown, metadata: { statusCode: 403 } } },
    {
      success: true,
      data: { markdown: "# Sorry, you have been blocked", metadata: { statusCode: 200 } },
    },
    { success: true, data: { markdown, metadata: { title: "Attention Required! | Cloudflare" } } },
    {
      success: true,
      data: { markdown, metadata: { title: ["Article", "Attention Required! | Cloudflare"] } },
    },
  ])("rejects unsuccessful, empty, or access-block provider content: %j", async (response) => {
    stubRequests(() => Response.json(response));
    await expect(execute()).rejects.toThrow(/Firecrawl/);
  });

  it.each(["https://8.8.8.8/article", "https://[2606:4700:4700::1111]/article"])(
    "accepts public IP literals without resolving them again: %s",
    async (url) => {
      stubRequests(() => Response.json(providerPage()));
      const result = await execute({ url });
      expect(result.structuredContent).toMatchObject({ url, retrieval: { provider: "firecrawl" } });
      expect(lookup).not.toHaveBeenCalled();
    },
  );

  it("removes client-only fragments before sharing a URL", async () => {
    const requests = stubRequests(() => Response.json(providerPage()));
    await execute({ url: `${sourceUrl}#client-only` });
    const call = requests.mock.calls.find(([url]) => String(url) === apiUrl);
    expect(call).toBeDefined();
    expect(JSON.parse(String(call?.[1]?.body)).url).toBe(sourceUrl);
  });

  it.each([
    { markdown: "Reflected fixture-key" },
    { markdown, metadata: { cacheState: "fixture-key" } },
  ])("never returns credentials reflected in provider content: %j", async (data) => {
    stubRequests(() => Response.json({ success: true, data }));
    await expect(execute()).rejects.toMatchObject({
      message: "Firecrawl returned credential-bearing content",
    });
  });

  it("does not expose malformed response text through parse errors", async () => {
    stubRequests(() => new Response('{"reflected":"fixture-key"'));
    await expect(execute()).rejects.toMatchObject({ message: "Firecrawl request failed" });
  });

  it("preserves cancellation during DNS without making a later provider request", async () => {
    const controller = new AbortController();
    const reason = new Error("Cancelled while resolving");
    vi.mocked(lookup).mockImplementation(async () => {
      controller.abort(reason);
      return [{ address: "93.184.216.34", family: 4 }];
    });
    const requests = stubRequests(() => Response.json(providerPage()));
    await expect(execute({}, controller.signal)).rejects.toBe(reason);
    expect(requests.mock.calls.some(([url]) => String(url) === apiUrl)).toBe(false);
  });

  it("reports provider HTTP failures without exposing response text or retrying", async () => {
    const requests = stubRequests(() => new Response("Reflected fixture-key", { status: 401 }));
    const failure = execute();
    await expect(failure).rejects.toThrow(/Firecrawl.*401/);
    const error: unknown = await failure.catch((reason: unknown) => reason);
    expect(inspect(error, { depth: null })).not.toContain("fixture-key");
    expect(requests.mock.calls.filter(([url]) => String(url) === apiUrl)).toHaveLength(1);
  });

  it("preserves cancellation during provider fetching", async () => {
    const controller = new AbortController();
    const reason = new Error("Cancelled by caller");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: RequestInit) => {
        if (String(url) !== apiUrl) return new Response("Forbidden", { status: 403 });
        controller.abort(reason);
        throw init?.signal?.reason;
      }),
    );
    await expect(execute({}, controller.signal)).rejects.toBe(reason);
  });

  it("bounds provider response-body reading by timeout", async () => {
    stubRequests(() => new Response(new ReadableStream()));
    await expect(execute({ timeout_ms: 20 })).rejects.toThrow(/Firecrawl.*timed out/i);
  });
});
