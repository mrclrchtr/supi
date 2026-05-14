import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSearchLibrary, mockGetContext, MockContext7Error } = vi.hoisted(() => ({
  mockSearchLibrary: vi.fn(),
  mockGetContext: vi.fn(),
  MockContext7Error: class extends Error {
    constructor(m: string) {
      super(m);
      this.name = "Context7Error";
    }
  },
}));

vi.mock("@upstash/context7-sdk", () => ({
  Context7: class {
    searchLibrary = mockSearchLibrary;
    getContext = mockGetContext;
  },
  Context7Error: MockContext7Error,
}));

import { getContext, searchLibrary } from "../src/context7-client.ts";

describe("context7-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("searchLibrary", () => {
    it("returns mapped search results", async () => {
      mockSearchLibrary.mockResolvedValue([
        {
          id: "/facebook/react",
          name: "React",
          description: "A JavaScript library for building user interfaces",
          totalSnippets: 2500,
          trustScore: 10,
          benchmarkScore: 95.5,
          versions: ["v18.2.0"],
        },
      ]);

      const results = await searchLibrary("How to use hooks", "react");

      expect(mockSearchLibrary).toHaveBeenCalledWith("How to use hooks", "react");
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
      mockSearchLibrary.mockResolvedValue([]);

      const results = await searchLibrary("nonexistent", "xyz");

      expect(results).toEqual([]);
    });
  });

  describe("getContext", () => {
    it("calls with txt type by default and returns string", async () => {
      const mockText = "### React Hooks\n\nContent here";
      mockGetContext.mockResolvedValue(mockText);

      const result = await getContext("How to use useState", "/facebook/react");

      expect(mockGetContext).toHaveBeenCalledWith("How to use useState", "/facebook/react", {
        type: "txt",
      });
      expect(result).toBe(mockText);
    });

    it("calls with json type when raw=true and returns snippets", async () => {
      const mockSnippets = [
        { title: "useState", content: "```jsx\ncode\n```", source: "react.dev" },
      ];
      mockGetContext.mockResolvedValue(mockSnippets);

      const result = await getContext("How to use useState", "/facebook/react", true);

      expect(mockGetContext).toHaveBeenCalledWith("How to use useState", "/facebook/react", {
        type: "json",
      });
      expect(result).toEqual(mockSnippets);
    });

    it("propagates Context7Error", async () => {
      mockGetContext.mockRejectedValue(new MockContext7Error("Library not found"));

      await expect(getContext("query", "/invalid/lib")).rejects.toThrow("Library not found");
    });
  });
});
