import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

import { Context7Error, getContext, searchLibrary } from "../../src/context7-client.ts";

/** Helper to create a mock fetch Response */
function mockResponse(status: number, body: unknown, contentType = "application/json"): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text, { status, headers: { "Content-Type": contentType } });
}

describe("context7-client", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("CONTEXT7_API_KEY", "ctx7sk-test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe("auth headers", () => {
    it("includes Authorization when CONTEXT7_API_KEY is set", async () => {
      mockFetch.mockResolvedValue(mockResponse(200, { results: [] }));

      await searchLibrary("test query", "react");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [_url, init] = mockFetch.mock.calls[0];
      expect(init?.headers).toHaveProperty("Authorization", "Bearer ctx7sk-test-key");
    });

    it("fails only when called without credentials and does not send an unauthenticated request", async () => {
      vi.stubEnv("CONTEXT7_API_KEY", undefined);

      await expect(searchLibrary("test query", "react")).rejects.toThrow(
        "Authentication is required",
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("searchLibrary", () => {
    it("returns mapped search results with title → name mapping", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(200, {
          results: [
            {
              id: "/facebook/react",
              title: "React",
              description: "A JavaScript library for building user interfaces",
              totalSnippets: 2500,
              trustScore: 10,
              benchmarkScore: 95.5,
              versions: ["v18.2.0"],
            },
          ],
        }),
      );

      const results = await searchLibrary("How to use hooks", "react");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = new URL(String(mockFetch.mock.calls[0][0]));
      expect(url.searchParams.get("query")).toBe("How to use hooks");
      expect(url.searchParams.get("libraryName")).toBe("react");

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: "/facebook/react",
        name: "React",
        description: "A JavaScript library for building user interfaces",
        totalSnippets: 2500,
        trustScore: 10,
        benchmarkScore: 95.5,
        versions: ["v18.2.0"],
      });
    });

    it("returns empty array for no results", async () => {
      mockFetch.mockResolvedValue(mockResponse(200, { results: [] }));

      const results = await searchLibrary("nonexistent", "xyz");

      expect(results).toEqual([]);
    });

    it("normalizes the provider's no_libraries_found 404 to a successful empty search", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(404, {
          error: "no_libraries_found",
          message: "No libraries found for this query.",
        }),
      );

      await expect(searchLibrary("unknown", "unknown")).resolves.toEqual([]);
    });

    it("does not treat malformed successful responses as empty searches", async () => {
      mockFetch.mockResolvedValue(mockResponse(200, {}));

      await expect(searchLibrary("query", "lib")).rejects.toThrow();
    });

    it.each([
      [404, "library_not_found"],
      [401, "unauthorized"],
      [429, "rate_limit_exceeded"],
      [503, "service_unavailable"],
      [403, "no_libraries_found"],
    ])(
      "preserves provider failure %s/%s without retries or empty-result normalization",
      async (status, code) => {
        mockFetch.mockResolvedValue(
          mockResponse(status, { error: code, message: "Provider error" }),
        );

        await expect(searchLibrary("query", "lib")).rejects.toMatchObject({
          name: "Context7Error",
          status,
          code,
          message: "Provider error",
        });
        expect(mockFetch).toHaveBeenCalledTimes(1);
      },
    );

    it("propagates network error", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      await expect(searchLibrary("query", "lib")).rejects.toMatchObject({
        code: "network_error",
        message: "Network failure",
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("getContext", () => {
    it("returns text for default mode", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(200, "### React Hooks\n\nContent here", "text/plain"),
      );

      const result = await getContext("How to use useState", "/facebook/react");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = new URL(String(mockFetch.mock.calls[0][0]));
      expect(url.searchParams.get("query")).toBe("How to use useState");
      expect(url.searchParams.get("libraryId")).toBe("/facebook/react");
      expect(url.searchParams.get("type")).toBe("txt");

      expect(result).toBe("### React Hooks\n\nContent here");
    });

    it("requests JSON and normalizes both provider snippet lists when raw=true", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(200, {
          codeSnippets: [
            {
              codeTitle: "Initialize state",
              codeDescription: "Create local state.",
              codeLanguage: "jsx",
              codeId: "https://react.dev/reference/react/useState#example",
              codeList: [{ language: "jsx", code: "const [count, setCount] = useState(0);" }],
            },
          ],
          infoSnippets: [
            {
              breadcrumb: "Hooks > State",
              content: "Call Hooks at the top level.",
              pageId: "https://react.dev/reference/rules/rules-of-hooks",
            },
          ],
        }),
      );

      const result = await getContext("How to use useState", "/react/react", true);

      expect(result).toEqual([
        {
          title: "Initialize state",
          content: "Create local state.\n\n```jsx\nconst [count, setCount] = useState(0);\n```",
          source: "https://react.dev/reference/react/useState#example",
        },
        {
          title: "Hooks > State",
          content: "Call Hooks at the top level.",
          source: "https://react.dev/reference/rules/rules-of-hooks",
        },
      ]);
      const [url] = mockFetch.mock.calls[0] as [string | URL];
      expect(new URL(String(url)).searchParams.get("type")).toBe("json");
    });

    it("keeps empty JSON context as a successful empty snippet array", async () => {
      mockFetch.mockResolvedValue(mockResponse(200, { codeSnippets: [], infoSnippets: [] }));

      await expect(getContext("query", "/lib", true)).resolves.toEqual([]);
    });

    it("preserves typed library redirects instead of returning an empty result", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(301, {
          error: "library_redirected",
          message: "Library moved to /react/react.",
        }),
      );

      const error = await getContext("query", "/facebook/react").catch((value: unknown) => value);
      expect(error).toBeInstanceOf(Context7Error);
      expect(error).toMatchObject({ status: 301, code: "library_redirected" });
    });

    it("propagates network error", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      await expect(getContext("query", "/lib")).rejects.toMatchObject({ code: "network_error" });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe.each([
    ["library search", (signal: AbortSignal) => searchLibrary("query", "lib", { signal })],
    ["docs fetch", (signal: AbortSignal) => getContext("query", "/lib", true, { signal })],
  ])("%s cancellation", (_name, run) => {
    it("rejects already-aborted calls without starting an HTTP request", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(run(controller.signal)).rejects.toMatchObject({ code: "request_aborted" });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("aborts the in-flight request rather than returning an empty result", async () => {
      const controller = new AbortController();
      const started = new Promise<AbortSignal>((resolve) => {
        mockFetch.mockImplementation((_url: unknown, init: RequestInit) => {
          const signal = init.signal;
          if (!signal) throw new Error("Missing cancellation signal");
          resolve(signal);
          return new Promise<Response>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
        });
      });
      const pending = run(controller.signal);
      const forwardedSignal = await started;
      controller.abort();

      await expect(pending).rejects.toMatchObject({ code: "request_aborted" });
      expect(forwardedSignal.aborted).toBe(true);
    });
  });
});
