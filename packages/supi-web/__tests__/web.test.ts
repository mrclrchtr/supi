import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import webExtension from "../src/web.ts";

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
    const tool = pi.tools[0] as { execute: (...args: unknown[]) => Promise<unknown> };
    const result = (await tool.execute(
      "tc-1",
      { url: "not-a-url" },
      undefined,
      undefined,
      makeCtx(),
    )) as {
      content: { text: string }[];
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("URL must be http(s)");
  });

  it("rejects non-http schemes", async () => {
    const pi = createPiMock();
    webExtension(pi as never);
    const tool = pi.tools[0] as { execute: (...args: unknown[]) => Promise<unknown> };
    const result = (await tool.execute(
      "tc-1",
      { url: "ftp://example.com" },
      undefined,
      undefined,
      makeCtx(),
    )) as {
      content: { text: string }[];
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("URL must be http(s)");
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

    const tool = pi.tools[0] as { execute: (...args: unknown[]) => Promise<unknown> };
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

    vi.unstubAllGlobals();
  });
});
