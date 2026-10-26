import { readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import type { WebFetchMdOutput } from "../../src/tool/web_fetch_md/result-schema.ts";
import { expectStructuredContent } from "../helpers/structured-result.ts";

interface ThemeMock {
  fg: (_color: string, text: string) => string;
}

interface RenderableTool {
  execute: (...args: unknown[]) => Promise<unknown>;
  renderResult: (...args: unknown[]) => { render: (width: number) => string[] };
}

import webExtension from "../../src/web.ts";

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

describe("webExtension", () => {
  it("registers the web_fetch_md tool", () => {
    const pi = createPiMock();
    webExtension(pi as never);
    expect(pi.tools).toHaveLength(1);
    const tool = pi.tools[0] as { name: string; label: string };
    expect(tool.name).toBe("web_fetch_md");
    expect(tool.label).toBe("Web Fetch");
  });

  it("rejects invalid URLs", async () => {
    const pi = createPiMock();
    webExtension(pi as never);
    const tool = pi.tools[0] as RenderableTool;

    await expect(
      tool.execute("tc-1", { url: "not-a-url" }, undefined, undefined, makeCtx()),
    ).rejects.toThrow("URL must be http(s)");
  });

  it("rejects non-http schemes", async () => {
    const pi = createPiMock();
    webExtension(pi as never);
    const tool = pi.tools[0] as RenderableTool;

    await expect(
      tool.execute("tc-1", { url: "ftp://example.com" }, undefined, undefined, makeCtx()),
    ).rejects.toThrow("URL must be http(s)");
  });

  it("fetches and returns markdown inline for small content", async () => {
    const pi = createPiMock();
    webExtension(pi as never);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "HEAD") {
          return new Response("", {
            status: 200,
            headers: { "content-type": "text/markdown" },
          });
        }
        return new Response("# Small\n\nContent", { status: 200 });
      }),
    );

    const tool = pi.tools[0] as RenderableTool;
    const result = (await tool.execute(
      "tc-1",
      { url: "https://example.com/doc" },
      undefined,
      undefined,
      makeCtx(),
    )) as {
      content: { text: string }[];
      details?: { chars: number; lines: number };
    };

    expect(result.content[0].text).toBe("# Small\n\nContent");
    expect(result.details?.chars).toBe(16);
    expect(result.details?.lines).toBe(3);
    expect(expectStructuredContent<WebFetchMdOutput>(tool, result)).toEqual({
      mode: "inline",
      url: "https://example.com/doc",
      chars: 16,
      lines: 3,
      markdown: result.content[0].text,
      modelOutput: { truncated: false },
    });

    const collapsed = renderToolResult(tool, result, false);
    const expanded = renderToolResult(tool, result, true);
    expect(collapsed).toContain("Fetched Markdown");
    expect(collapsed).toContain("expand for output");
    expect(collapsed).not.toContain("# Small");
    expect(expanded).toContain("# Small");
    expect(expanded).toContain("Content");

    vi.unstubAllGlobals();
  });

  it.each([
    ["file", "# Small"],
    ["auto", "x".repeat(15_001)],
  ])(
    "keeps %s file delivery usable without duplicating the body",
    async (output_mode, markdown) => {
      const pi = createPiMock();
      webExtension(pi as never);
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async (_url: unknown, init?: RequestInit) =>
            new Response(init?.method === "HEAD" ? null : markdown, {
              headers: { "content-type": "text/markdown" },
            }),
        ),
      );
      const tool = pi.tools[0] as RenderableTool;
      try {
        const result = await tool.execute(
          "file",
          {
            url: "https://example.com/file",
            output_mode,
          },
          undefined,
          undefined,
          makeCtx(),
        );
        const data = expectStructuredContent<WebFetchMdOutput>(tool, result);
        expect(data.mode).toBe("file");
        if (data.mode !== "file") throw new Error("Expected file payload");
        try {
          expect(data.chars).toBe(markdown.length);
          expect(await readFile(data.filePath, "utf8")).toBe(markdown);
          expect(result).toMatchObject({
            content: [{ text: expect.stringContaining(data.filePath) }],
            details: { filePath: data.filePath },
          });
          expect(renderToolResult(tool, result, false)).toContain("Saved Markdown to");
          expect(data).not.toHaveProperty("markdown");
        } finally {
          await rm(dirname(data.filePath), { recursive: true, force: true });
        }
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("truncates model-visible inline output and saves full content", async () => {
    const pi = createPiMock();
    webExtension(pi as never);
    const largeMarkdown = Array.from({ length: 2001 }, (_, index) => `line ${index}`).join("\n");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "HEAD") {
          return new Response("", {
            status: 200,
            headers: { "content-type": "text/markdown" },
          });
        }
        return new Response(largeMarkdown, { status: 200 });
      }),
    );

    const tool = pi.tools[0] as RenderableTool;
    const result = (await tool.execute(
      "tc-1",
      { url: "https://example.com/huge", output_mode: "inline" },
      undefined,
      undefined,
      makeCtx(),
    )) as {
      content: { text: string }[];
      details?: { fullOutputPath?: string; truncation?: { truncated: boolean } };
    };

    expect(result.content[0].text).toContain("Output truncated");
    expect(result.details?.truncation?.truncated).toBe(true);
    expect(result.details?.fullOutputPath).toMatch(/web-fetch-md-/);
    const data = expectStructuredContent<WebFetchMdOutput>(tool, result);
    expect(data.mode).toBe("inline");
    if (data.mode !== "inline") throw new Error("Expected inline payload");
    expect(data.markdown).toBe(largeMarkdown);
    expect(data.modelOutput).toEqual({
      truncated: true,
      fullOutputPath: result.details?.fullOutputPath,
    });
    expect(renderToolResult(tool, result, false)).toContain("[truncated]");
    if (data.modelOutput.fullOutputPath) {
      await rm(dirname(data.modelOutput.fullOutputPath), { recursive: true, force: true });
    }

    vi.unstubAllGlobals();
  });
});
