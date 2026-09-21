import { rmSync } from "node:fs";
import { join } from "node:path";
import { createPiMock, getTool, getTools, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import extension from "../../src/extension.ts";
import webExtension from "../../src/web.ts";
import {
  createFakeBx,
  type FakeBx,
  readFakeBxArgs,
  restoreFakeBx,
  useFakeBx,
  writeWebSearchSetting,
} from "../helpers/fake-bx.ts";

type WebSearchTool = {
  execute: (...args: unknown[]) => Promise<unknown>;
};

describe("web_search process integration", () => {
  let fake: FakeBx;
  let originalEnvironment: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnvironment = Object.fromEntries(
      ["PATH", "BX_ARGS_FILE", "BX_OUTPUT", "BX_STDERR", "BX_EXIT_CODE"].map((key) => [
        key,
        process.env[key],
      ]),
    );
    fake = createFakeBx();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.unstubAllEnvs();
    fake.cleanup();
  });

  it("passes exact direct arguments, including a leading-hyphen query", async () => {
    useFakeBx(fake, JSON.stringify({ grounding: { generic: [] } }));
    writeWebSearchSetting(fake.cwd, true);

    const pi = createPiMock();
    webExtension(pi as never);
    expect(pi.tools).toHaveLength(1);
    await pi.emit("session_start", { reason: "startup" }, makeCtx({ cwd: fake.cwd }));

    const tool = getTool(pi, "web_search") as unknown as WebSearchTool;
    await tool.execute(
      "call-1",
      { query: "-leading query", freshness: "pw" },
      undefined,
      undefined,
      makeCtx({ cwd: fake.cwd }),
    );

    expect(readFakeBxArgs(fake)).toEqual([
      "context",
      "--extra",
      "freshness=pw",
      "--",
      "-leading query",
    ]);
  });

  it("keeps freshness and all request budget fields unset when freshness is omitted", async () => {
    useFakeBx(fake, JSON.stringify({ grounding: { generic: [] } }));
    writeWebSearchSetting(fake.cwd, true);

    const pi = createPiMock();
    webExtension(pi as never);
    await pi.emit("session_start", { reason: "startup" }, makeCtx({ cwd: fake.cwd }));
    const tool = getTool(pi, "web_search") as unknown as WebSearchTool;

    await tool.execute(
      "call-2",
      { query: "ordinary query" },
      undefined,
      undefined,
      makeCtx({ cwd: fake.cwd }),
    );

    expect(readFakeBxArgs(fake)).toEqual(["context", "--", "ordinary query"]);
  });

  it("warns on load when enabled but bx is missing", async () => {
    useFakeBx(fake, JSON.stringify({ grounding: { generic: [] } }));
    rmSync(join(fake.directory, "bx"));
    writeWebSearchSetting(fake.cwd, true);

    const pi = createPiMock();
    webExtension(pi as never);
    const ctx = makeCtx({ cwd: fake.cwd });
    await pi.emit("session_start", { reason: "startup" }, ctx);

    expect(pi.tools).toHaveLength(1);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("bx"), "warning");
  });

  it("keeps web_fetch_md available when Web Search is disabled", async () => {
    useFakeBx(fake, JSON.stringify({ grounding: { generic: [] } }));
    writeWebSearchSetting(fake.cwd, false);

    const pi = createPiMock();
    webExtension(pi as never);
    await pi.emit("session_start", { reason: "startup" }, makeCtx({ cwd: fake.cwd }));

    expect(pi.tools).toHaveLength(1);
    expect(getTool(pi, "web_fetch_md")).toBeDefined();
  });

  it("returns all sources, excerpts, added fields, and safe source dates", async () => {
    const firstUrl = "https://example.test/first";
    const secondUrl = "https://example.test/second";
    const encodedSnippet = JSON.stringify({ text: "structured excerpt" });
    useFakeBx(
      fake,
      JSON.stringify({
        grounding: {
          generic: [
            {
              title: "First source",
              url: firstUrl,
              snippets: ["first excerpt", encodedSnippet],
              extra: { ignored: true },
            },
            {
              title: "Second source",
              url: secondUrl,
              snippets: ["second excerpt"],
            },
          ],
        },
        sources: {
          [firstUrl]: { age: ["2024-02-29", "provider detail"], extra: true },
          [secondUrl]: { age: ["not a date"] },
        },
        extraEnvelopeField: "ignored",
      }),
    );
    writeWebSearchSetting(fake.cwd, true);

    const pi = createPiMock();
    webExtension(pi as never);
    await pi.emit("session_start", { reason: "startup" }, makeCtx({ cwd: fake.cwd }));
    const tool = getTool(pi, "web_search") as unknown as WebSearchTool;
    const result = (await tool.execute(
      "call-3",
      { query: "sources" },
      undefined,
      undefined,
      makeCtx({ cwd: fake.cwd }),
    )) as {
      content: Array<{ text: string }>;
      details: { sourceCount: number; excerptCount: number };
    };

    expect(result.content[0]?.text).toContain("First source");
    expect(result.content[0]?.text).toContain(firstUrl);
    expect(result.content[0]?.text).toContain(encodedSnippet);
    expect(result.content[0]?.text).toContain("second excerpt");
    expect(result.content[0]?.text).toContain("Source date: 2024-02-29");
    expect(result.content[0]?.text).toContain(
      "Dates are provider-reported publication or modification dates.",
    );
    expect(result.content[0]?.text).not.toContain("Source Excerpt:");
    expect(result.content[0]?.text).not.toContain("not a date");
    expect(result.details).toEqual(expect.objectContaining({ sourceCount: 2, excerptCount: 3 }));
  });

  it("decodes UTF-8 when a multibyte character crosses stdout chunks", async () => {
    fake.cleanup();
    fake = createFakeBx({ splitUtf8: true });
    useFakeBx(fake, "");
    writeWebSearchSetting(fake.cwd, true);

    const pi = createPiMock();
    webExtension(pi as never);
    await pi.emit("session_start", { reason: "startup" }, makeCtx({ cwd: fake.cwd }));
    const tool = getTool(pi, "web_search") as unknown as WebSearchTool;
    const result = (await tool.execute(
      "call-utf8",
      { query: "utf8" },
      undefined,
      undefined,
      makeCtx({ cwd: fake.cwd }),
    )) as { content: Array<{ text: string }> };

    expect(result.content[0]?.text).toContain("€");
    expect(result.content[0]?.text).not.toContain("�");
  });

  it("accepts a valid empty generic list", async () => {
    useFakeBx(fake, JSON.stringify({ grounding: { generic: [] }, unknown: true }));
    writeWebSearchSetting(fake.cwd, true);

    const pi = createPiMock();
    webExtension(pi as never);
    await pi.emit("session_start", { reason: "startup" }, makeCtx({ cwd: fake.cwd }));
    const tool = getTool(pi, "web_search") as unknown as WebSearchTool;

    const result = (await tool.execute(
      "call-4",
      { query: "no sources" },
      undefined,
      undefined,
      makeCtx({ cwd: fake.cwd }),
    )) as { content: Array<{ text: string }>; details: { sourceCount: number } };

    expect(result.content[0]?.text).toBe("No web search sources found.");
    expect(result.details.sourceCount).toBe(0);
  });

  it("applies persisted settings only in fresh extension instances", async () => {
    useFakeBx(fake, JSON.stringify({ grounding: { generic: [] } }));
    writeWebSearchSetting(fake.cwd, false);

    const disabledPi = createPiMock();
    webExtension(disabledPi as never);
    await disabledPi.emit("session_start", { reason: "reload" }, makeCtx({ cwd: fake.cwd }));
    expect(getTools(disabledPi).some((tool) => tool.name === "web_search")).toBe(false);

    writeWebSearchSetting(fake.cwd, true);
    const enabledPi = createPiMock();
    webExtension(enabledPi as never);
    await enabledPi.emit("session_start", { reason: "reload" }, makeCtx({ cwd: fake.cwd }));
    expect(getTool(enabledPi, "web_search")).toBeDefined();

    writeWebSearchSetting(fake.cwd, false);
    await enabledPi.emit("session_start", { reason: "reload" }, makeCtx({ cwd: fake.cwd }));
    expect(getTool(enabledPi, "web_search")).toBeDefined();
  });

  it("applies a fresh reload when bx changes from missing to installed", async () => {
    useFakeBx(fake, JSON.stringify({ grounding: { generic: [] } }));
    rmSync(join(fake.directory, "bx"));
    writeWebSearchSetting(fake.cwd, true);

    const missingPi = createPiMock();
    webExtension(missingPi as never);
    await missingPi.emit("session_start", { reason: "reload" }, makeCtx({ cwd: fake.cwd }));
    expect(getTools(missingPi).some((tool) => tool.name === "web_search")).toBe(false);

    restoreFakeBx(fake);
    const installedPi = createPiMock();
    webExtension(installedPi as never);
    await installedPi.emit("session_start", { reason: "reload" }, makeCtx({ cwd: fake.cwd }));
    expect(getTools(installedPi).some((tool) => tool.name === "web_search")).toBe(true);
  });

  it("loads the existing web tools when bx is missing", async () => {
    useFakeBx(fake, JSON.stringify({ grounding: { generic: [] } }));
    rmSync(join(fake.directory, "bx"));
    writeWebSearchSetting(fake.cwd, true);

    const pi = createPiMock();
    extension(pi as never);
    await pi.emit("session_start", { reason: "reload" }, makeCtx({ cwd: fake.cwd }));

    expect(getTools(pi).map((tool) => tool.name)).toEqual([
      "web_fetch_md",
      "web_docs_search",
      "web_docs_fetch",
    ]);
  });

  it("does not slice a large provider source list", async () => {
    const generic = Array.from({ length: 12 }, (_, index) => ({
      title: `Source ${index}`,
      url: `https://example.test/${index}`,
      snippets: [`excerpt ${index}a`, `excerpt ${index}b`],
    }));
    useFakeBx(fake, JSON.stringify({ grounding: { generic } }));
    writeWebSearchSetting(fake.cwd, true);

    const pi = createPiMock();
    webExtension(pi as never);
    await pi.emit("session_start", { reason: "startup" }, makeCtx({ cwd: fake.cwd }));
    const tool = getTool(pi, "web_search") as unknown as WebSearchTool;
    const result = (await tool.execute(
      "call-5",
      { query: "many sources" },
      undefined,
      undefined,
      makeCtx({ cwd: fake.cwd }),
    )) as { content: Array<{ text: string }>; details: { sourceCount: number } };

    expect(result.content[0]?.text).toContain("Source 11");
    expect(result.content[0]?.text).toContain("excerpt 11b");
    expect(result.details.sourceCount).toBe(12);
  });
});
