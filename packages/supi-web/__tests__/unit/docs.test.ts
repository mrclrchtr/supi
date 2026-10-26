import { createPiMock, getTool, getTools, makeCtx } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebDocsFetchOutput } from "../../src/tool/web_docs_fetch/result-schema.ts";
import type { WebDocsSearchOutput } from "../../src/tool/web_docs_search/result-schema.ts";
import { expectStructuredContent } from "../helpers/structured-result.ts";

interface ThemeMock {
  fg: (_color: string, text: string) => string;
}

interface RenderableTool {
  execute: (...args: unknown[]) => Promise<unknown>;
  renderResult: (...args: unknown[]) => { render: (width: number) => string[] };
}

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

vi.mock("../../src/context7-client.ts", () => ({
  searchLibrary: mockSearchLibrary,
  getContext: mockGetContext,
  Context7Error: MockContext7Error,
}));

import docsExtension from "../../src/docs.ts";

/** Result shape returned by both web_docs tools. */
type ToolResult = {
  content: { type: "text"; text: string }[];
  details?: Record<string, unknown>;
};

function createTheme(): ThemeMock {
  return {
    fg: (_color, text) => text,
  };
}

function renderToolResult(tool: RenderableTool, result: unknown, expanded: boolean): string {
  return tool
    .renderResult(result, { expanded, isPartial: false }, createTheme(), {} as never)
    .render(120)
    .join("\n");
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

      await expect(
        tool.execute("tc-1", { query: "how to do X" }, undefined, undefined, makeCtx()),
      ).rejects.toThrow("library_name");
    });

    it("rejects missing query", async () => {
      const tool = getTool(pi, "web_docs_search");

      await expect(
        tool.execute("tc-1", { library_name: "react" }, undefined, undefined, makeCtx()),
      ).rejects.toThrow("query");
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

      const tool = getTool(pi, "web_docs_search") as unknown as RenderableTool;
      const result = (await tool.execute(
        "tc-1",
        { library_name: "react", query: "how to use hooks" },
        undefined,
        undefined,
        makeCtx(),
      )) as ToolResult;

      expect(mockSearchLibrary).toHaveBeenCalledWith("how to use hooks", "react", undefined);
      expect(result.content[0].text).toContain("React");
      expect(result.content[0].text).toContain("/facebook/react");
      expect(result.content[0].text).toContain("95.5");
      expect(result.details?.count).toBe(1);
      const data = expectStructuredContent<WebDocsSearchOutput>(tool, result);
      expect(data.results).toEqual(await mockSearchLibrary.mock.results[0].value);
      expect(data.count).toBe(result.details?.count);
      expect(data.modelOutput).toEqual({ truncated: false, omittedResults: 0 });

      const collapsed = renderToolResult(tool, result, false);
      const expanded = renderToolResult(tool, result, true);
      expect(collapsed).toContain("Found 1 library");
      expect(collapsed).toContain("expand for output");
      expect(collapsed).not.toContain("| ID |");
      expect(expanded).toContain("| ID |");
      expect(expanded).toContain("/facebook/react");
    });

    it("keeps large search result metadata compact", async () => {
      mockSearchLibrary.mockResolvedValue(
        Array.from({ length: 12 }, (_, index) => ({
          id: `/example/lib-${index}`,
          name: `Library ${index}`,
          description: `Long description for library ${index}. `.repeat(10),
          totalSnippets: 100 + index,
          trustScore: 8,
          benchmarkScore: 90 + index,
          versions: ["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8"],
        })),
      );

      const tool = getTool(pi, "web_docs_search");
      const result = (await tool.execute(
        "tc-1",
        { library_name: "lib", query: "docs" },
        undefined,
        undefined,
        makeCtx(),
      )) as ToolResult;

      const text = result.content[0].text;
      expect(text).toContain("showing top 10");
      expect(text).toContain("v1, v2, v3, v4, v5, +3");
      expect(text).toContain("…");
      expect(text).not.toContain("/example/lib-10");
      const data = expectStructuredContent<WebDocsSearchOutput>(tool, result);
      expect(data.count).toBe(12);
      expect(data.results).toHaveLength(12);
      expect(data.results[11]).toMatchObject({
        id: "/example/lib-11",
        description: "Long description for library 11. ".repeat(10),
        versions: ["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8"],
      });
      expect(data.modelOutput).toEqual({ truncated: false, omittedResults: 2 });
    });

    it("returns helpful message when no results found", async () => {
      mockSearchLibrary.mockResolvedValue([]);

      const tool = getTool(pi, "web_docs_search");
      const result = (await tool.execute(
        "tc-1",
        { library_name: "nonexistent-lib", query: "something" },
        undefined,
        undefined,
        makeCtx(),
      )) as ToolResult;

      expect(result.content[0].text).toContain("No libraries found");
      expect(expectStructuredContent<WebDocsSearchOutput>(tool, result)).toEqual({
        results: [],
        count: 0,
        modelOutput: { truncated: false, omittedResults: 0 },
      });
    });
  });

  describe("web_docs_fetch", () => {
    it("rejects missing library_id", async () => {
      const tool = getTool(pi, "web_docs_fetch");

      await expect(
        tool.execute("tc-1", { query: "how to do X" }, undefined, undefined, makeCtx()),
      ).rejects.toThrow("library_id");
    });

    it("rejects missing query", async () => {
      const tool = getTool(pi, "web_docs_fetch");

      await expect(
        tool.execute("tc-1", { library_id: "/facebook/react" }, undefined, undefined, makeCtx()),
      ).rejects.toThrow("query");
    });

    it("returns markdown content in text mode by default", async () => {
      mockGetContext.mockResolvedValue("### React Hooks\n\nContent here");

      const tool = getTool(pi, "web_docs_fetch") as unknown as RenderableTool;
      const result = (await tool.execute(
        "tc-1",
        { library_id: "/facebook/react", query: "how to use hooks" },
        undefined,
        undefined,
        makeCtx(),
      )) as ToolResult;

      expect(mockGetContext).toHaveBeenCalledWith(
        "how to use hooks",
        "/facebook/react",
        false,
        undefined,
      );
      expect(result.content[0].text).toBe("### React Hooks\n\nContent here");
      expect(expectStructuredContent<WebDocsFetchOutput>(tool, result)).toMatchObject({
        libraryId: "/facebook/react",
        format: "markdown",
        markdown: result.content[0].text,
        modelOutput: { truncated: false },
      });

      const collapsed = renderToolResult(tool, result, false);
      const expanded = renderToolResult(tool, result, true);
      expect(collapsed).toContain("Fetched Markdown");
      expect(collapsed).toContain("/facebook/react");
      expect(collapsed).not.toContain("### React Hooks");
      expect(expanded).toContain("### React Hooks");
      expect(expanded).toContain("Content here");
    });

    it("returns raw json when raw=true", async () => {
      const snippets = [{ title: "useState", content: "code", source: "react.dev" }];
      mockGetContext.mockResolvedValue(snippets);

      const tool = getTool(pi, "web_docs_fetch");
      const result = (await tool.execute(
        "tc-1",
        {
          library_id: "/facebook/react",
          query: "useState",
          raw: true,
        },
        undefined,
        undefined,
        makeCtx(),
      )) as ToolResult;

      expect(mockGetContext).toHaveBeenCalledWith("useState", "/facebook/react", true, undefined);
      expect(result.content[0].text).toBe(JSON.stringify(snippets, null, 2));
      expect(expectStructuredContent<WebDocsFetchOutput>(tool, result)).toMatchObject({
        libraryId: "/facebook/react",
        format: "snippets",
        snippets,
        modelOutput: { truncated: false },
      });
    });

    it("truncates large docs output and saves the full response", async () => {
      mockGetContext.mockResolvedValue(
        Array.from({ length: 2001 }, (_, index) => `docs line ${index}`).join("\n"),
      );

      const tool = getTool(pi, "web_docs_fetch");
      const result = (await tool.execute(
        "tc-1",
        { library_id: "/facebook/react", query: "hooks" },
        undefined,
        undefined,
        makeCtx(),
      )) as ToolResult;

      expect(result.content[0].text).toContain("Output truncated");
      expect(result.details?.truncation).toMatchObject({ truncated: true });
      expect(result.details?.fullOutputPath).toMatch(/web-docs-fetch-/);
      const data = expectStructuredContent<WebDocsFetchOutput>(tool, result);
      if (data.format !== "markdown") throw new Error("Expected text payload");
      expect(data.markdown).toContain("docs line 2000");
      expect(data.modelOutput).toEqual({
        truncated: true,
        fullOutputPath: result.details?.fullOutputPath,
      });
    });

    it("returns successful empty raw snippets without treating them as failure", async () => {
      mockGetContext.mockResolvedValue([]);
      const tool = getTool(pi, "web_docs_fetch");
      const result = await tool.execute(
        "empty",
        {
          library_id: "/facebook/react",
          query: "unknown",
          raw: true,
        },
        undefined,
        undefined,
        makeCtx(),
      );
      expect(expectStructuredContent<WebDocsFetchOutput>(tool, result)).toMatchObject({
        format: "snippets",
        snippets: [],
        modelOutput: { truncated: false },
      });
      expect(result).not.toHaveProperty("isError", true);
    });

    it("propagates Context7Error", async () => {
      mockGetContext.mockRejectedValue(new MockContext7Error("Library not found"));

      const tool = getTool(pi, "web_docs_fetch");
      await expect(
        tool.execute(
          "tc-1",
          { library_id: "/invalid/lib", query: "test" },
          undefined,
          undefined,
          makeCtx(),
        ),
      ).rejects.toThrow("Library not found");
    });
  });
});
