import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.stubGlobal("fetch", mockFetch);

import { Context7Error, getContext, searchLibrary } from "../../src/context7-client.ts";

/** Helper to create a mock fetch Response */
function mockResponse(status: number, body: unknown, contentType = "application/json"): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
    text: async () => text,
    headers: new Headers({ "Content-Type": contentType }),
  } as Response;
}

describe("context7-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CONTEXT7_API_KEY;
  });

  describe("auth headers", () => {
    it("includes Authorization when CONTEXT7_API_KEY is set", async () => {
      process.env.CONTEXT7_API_KEY = "ctx7sk-test-key";
      mockFetch.mockResolvedValue(mockResponse(200, { results: [] }));

      await searchLibrary("test query", "react");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [_url, init] = mockFetch.mock.calls[0];
      expect(init?.headers).toHaveProperty("Authorization", "Bearer ctx7sk-test-key");
    });

    it("omits Authorization when CONTEXT7_API_KEY is not set", async () => {
      mockFetch.mockResolvedValue(mockResponse(200, { results: [] }));

      await searchLibrary("test query", "react");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockFetch.mock.calls[0];
      expect(init?.headers).not.toHaveProperty("Authorization");
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
      const [url] = mockFetch.mock.calls[0] as [URL];
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

    it("returns empty array when results field is missing", async () => {
      mockFetch.mockResolvedValue(mockResponse(200, {}));

      const results = await searchLibrary("query", "lib");

      expect(results).toEqual([]);
    });

    it("passes AbortSignal to fetch", async () => {
      const controller = new AbortController();
      mockFetch.mockResolvedValue(mockResponse(200, { results: [] }));

      await searchLibrary("query", "lib", { signal: controller.signal });

      const [, init] = mockFetch.mock.calls[0];
      expect(init?.signal).toBe(controller.signal);
    });

    it("propagates Context7Error on 404", async () => {
      mockFetch.mockResolvedValue(mockResponse(404, { message: "Library not found" }));

      await expect(searchLibrary("query", "lib")).rejects.toThrow(Context7Error);
      await expect(searchLibrary("query", "lib")).rejects.toThrow("Library not found");
    });

    it("propagates Context7Error on 401", async () => {
      mockFetch.mockResolvedValue(mockResponse(401, {}));

      await expect(searchLibrary("query", "lib")).rejects.toThrow(Context7Error);
      await expect(searchLibrary("query", "lib")).rejects.toThrow("Invalid API key");
    });

    it("propagates Context7Error on 429", async () => {
      mockFetch.mockResolvedValue(mockResponse(429, {}));

      await expect(searchLibrary("query", "lib")).rejects.toThrow(Context7Error);
      await expect(searchLibrary("query", "lib")).rejects.toThrow("Rate limited");
    });

    it("propagates network error", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      await expect(searchLibrary("query", "lib")).rejects.toThrow("Network failure");
    });
  });

  describe("getContext", () => {
    it("returns text for default mode", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(200, "### React Hooks\n\nContent here", "text/plain"),
      );

      const result = await getContext("How to use useState", "/facebook/react");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0] as [URL];
      expect(url.searchParams.get("query")).toBe("How to use useState");
      expect(url.searchParams.get("libraryId")).toBe("/facebook/react");

      expect(result).toBe("### React Hooks\n\nContent here");
    });

    it("returns parsed JSON snippets when raw=true", async () => {
      const snippets = [{ title: "useState", content: "```jsx\ncode\n```", source: "react.dev" }];
      mockFetch.mockResolvedValue(mockResponse(200, snippets));

      const result = await getContext("How to use useState", "/facebook/react", true);

      expect(result).toEqual(snippets);
    });

    it("passes AbortSignal to fetch", async () => {
      const controller = new AbortController();
      mockFetch.mockResolvedValue(mockResponse(200, "docs", "text/plain"));

      await getContext("query", "/lib", false, { signal: controller.signal });

      const [, init] = mockFetch.mock.calls[0];
      expect(init?.signal).toBe(controller.signal);
    });

    it("propagates Context7Error on non-ok response", async () => {
      mockFetch.mockResolvedValue(mockResponse(404, { message: "Library not found" }));

      await expect(getContext("query", "/invalid/lib")).rejects.toThrow(Context7Error);
      await expect(getContext("query", "/invalid/lib")).rejects.toThrow("Library not found");
    });

    it("propagates network error", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      await expect(getContext("query", "/lib")).rejects.toThrow("Network failure");
    });
  });
});
