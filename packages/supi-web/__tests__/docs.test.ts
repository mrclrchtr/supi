import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
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

vi.mock("../src/context7-client.ts", () => ({
  searchLibrary: mockSearchLibrary,
  getContext: mockGetContext,
  Context7Error: MockContext7Error,
}));

import docsExtension from "../src/docs.ts";

type ToolDef = {
  name: string;
  label?: string;
  parameters: unknown;
  execute: (...args: unknown[]) => Promise<{
    content: { type: "text"; text: string }[];
    isError?: boolean;
    details?: Record<string, unknown>;
  }>;
  promptSnippet?: string;
  promptGuidelines?: string[];
};

function getTools(pi: ReturnType<typeof createPiMock>): ToolDef[] {
  return pi.tools as unknown as ToolDef[];
}

function getTool(pi: ReturnType<typeof createPiMock>, name: string): ToolDef {
  const tool = getTools(pi).find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

describe("docsExtension", () => {
  let pi: ReturnType<typeof createPiMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    pi = createPiMock();
    docsExtension(pi as never);
  });

  it("registers web_docs_search and web_docs_fetch tools", () => {
    const tools = getTools(pi);
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("web_docs_search");
    expect(tools[1].name).toBe("web_docs_fetch");
  });

  describe("web_docs_search", () => {
    it("rejects missing library_name", async () => {
      const tool = getTool(pi, "web_docs_search");
      const result = await tool.execute(
        "tc-1",
        { query: "how to do X" },
        undefined,
        undefined,
        makeCtx(),
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("library_name");
    });

    it("rejects missing query", async () => {
      const tool = getTool(pi, "web_docs_search");
      const result = await tool.execute(
        "tc-1",
        { library_name: "react" },
        undefined,
        undefined,
        makeCtx(),
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("query");
    });

    it("returns formatted markdown table of search results", async () => {
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

      const tool = getTool(pi, "web_docs_search");
      const result = await tool.execute(
        "tc-1",
        { library_name: "react", query: "how to use hooks" },
        undefined,
        undefined,
        makeCtx(),
      );

      expect(result.isError).toBeUndefined();
      expect(mockSearchLibrary).toHaveBeenCalledWith("how to use hooks", "react");
      expect(result.content[0].text).toContain("React");
      expect(result.content[0].text).toContain("/facebook/react");
      expect(result.content[0].text).toContain("95.5");
      expect(result.details?.count).toBe(1);
    });

    it("returns helpful message when no results found", async () => {
      mockSearchLibrary.mockResolvedValue([]);

      const tool = getTool(pi, "web_docs_search");
      const result = await tool.execute(
        "tc-1",
        { library_name: "nonexistent-lib", query: "something" },
        undefined,
        undefined,
        makeCtx(),
      );

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("No libraries found");
    });
  });

  describe("web_docs_fetch", () => {
    it("rejects missing library_id", async () => {
      const tool = getTool(pi, "web_docs_fetch");
      const result = await tool.execute(
        "tc-1",
        { query: "how to do X" },
        undefined,
        undefined,
        makeCtx(),
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("library_id");
    });

    it("rejects missing query", async () => {
      const tool = getTool(pi, "web_docs_fetch");
      const result = await tool.execute(
        "tc-1",
        { library_id: "/facebook/react" },
        undefined,
        undefined,
        makeCtx(),
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("query");
    });

    it("returns markdown content in text mode by default", async () => {
      mockGetContext.mockResolvedValue("### React Hooks\n\nContent here");

      const tool = getTool(pi, "web_docs_fetch");
      const result = await tool.execute(
        "tc-1",
        { library_id: "/facebook/react", query: "how to use hooks" },
        undefined,
        undefined,
        makeCtx(),
      );

      expect(result.isError).toBeUndefined();
      expect(mockGetContext).toHaveBeenCalledWith("how to use hooks", "/facebook/react", false);
      expect(result.content[0].text).toBe("### React Hooks\n\nContent here");
    });

    it("returns raw json when raw=true", async () => {
      const snippets = JSON.stringify([
        { title: "useState", content: "code", source: "react.dev" },
      ]);
      mockGetContext.mockResolvedValue(snippets);

      const tool = getTool(pi, "web_docs_fetch");
      const result = await tool.execute(
        "tc-1",
        {
          library_id: "/facebook/react",
          query: "useState",
          raw: true,
        },
        undefined,
        undefined,
        makeCtx(),
      );

      expect(result.isError).toBeUndefined();
      expect(mockGetContext).toHaveBeenCalledWith("useState", "/facebook/react", true);
      expect(result.content[0].text).toContain("useState");
    });

    it("propagates Context7Error", async () => {
      mockGetContext.mockRejectedValue(new MockContext7Error("Library not found"));

      const tool = getTool(pi, "web_docs_fetch");
      const result = await tool.execute(
        "tc-1",
        { library_id: "/invalid/lib", query: "test" },
        undefined,
        undefined,
        makeCtx(),
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Library not found");
    });
  });
});
