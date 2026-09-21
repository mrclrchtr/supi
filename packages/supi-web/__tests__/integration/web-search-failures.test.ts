import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runBxContext } from "../../src/tool/web_search/bx.ts";
import webExtension from "../../src/web.ts";
import { createFakeBx, type FakeBx, useFakeBx, writeWebSearchSetting } from "../helpers/fake-bx.ts";

type WebSearchTool = {
  execute: (...args: unknown[]) => Promise<unknown>;
};

describe("web_search failures and output limits", () => {
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
    fake.cleanup();
  });

  it("throws for malformed required response data", async () => {
    useFakeBx(
      fake,
      JSON.stringify({
        grounding: {
          generic: [{ title: "Missing URL", snippets: ["excerpt"] }],
        },
      }),
    );
    writeWebSearchSetting(fake.cwd, true);
    const pi = createPiMock();
    webExtension(pi as never);
    await pi.emit("session_start", { reason: "startup" }, makeCtx({ cwd: fake.cwd }));

    const tool = getTool(pi, "web_search") as unknown as WebSearchTool;
    await expect(
      tool.execute(
        "call-6",
        { query: "bad data" },
        undefined,
        undefined,
        makeCtx({ cwd: fake.cwd }),
      ),
    ).rejects.toThrow("malformed");
  });

  it.each([
    [1, "client error"],
    [2, "CLI usage or compatibility error"],
    [3, "authentication or permission error"],
    [4, "rate limit reached"],
    [5, "server or network error"],
    [42, "unknown bx error"],
  ])("maps bx exit code %s to a safe %s message", async (exitCode, expected) => {
    useFakeBx(fake, "", exitCode, "SECRET_TOKEN=do-not-show");

    await expect(runBxContext("service failure", undefined, { cwd: fake.cwd })).rejects.toThrow(
      expected,
    );
  });

  it("hides unrestricted stderr on process failure", async () => {
    useFakeBx(fake, "", 3, "SECRET_TOKEN=do-not-show");
    writeWebSearchSetting(fake.cwd, true);
    const pi = createPiMock();
    webExtension(pi as never);
    await pi.emit("session_start", { reason: "startup" }, makeCtx({ cwd: fake.cwd }));
    const tool = getTool(pi, "web_search") as unknown as WebSearchTool;

    const error = (await tool
      .execute(
        "call-7",
        { query: "service failure" },
        undefined,
        undefined,
        makeCtx({ cwd: fake.cwd }),
      )
      .catch((value) => value as Error)) as Error;

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("authentication or permission error");
    expect(error.message).not.toContain("SECRET_TOKEN");
  });

  it("honors an already-aborted signal without starting bx", async () => {
    useFakeBx(fake, JSON.stringify({ grounding: { generic: [] } }));
    const controller = new AbortController();
    controller.abort();

    await expect(
      runBxContext("query", undefined, { cwd: fake.cwd, signal: controller.signal }),
    ).rejects.toThrow("cancelled");
  });

  it("reports a missing executable without starting a fallback", async () => {
    const emptyPath = mkdtempSync(join(tmpdir(), "supi-web-empty-path-"));
    try {
      process.env.PATH = emptyPath;
      await expect(runBxContext("query", undefined, { cwd: fake.cwd })).rejects.toThrow(
        "not found on PATH",
      );
    } finally {
      rmSync(emptyPath, { recursive: true, force: true });
    }
  });

  it("honors cancellation and terminates the single bx process", async () => {
    fake.cleanup();
    fake = createFakeBx({ wait: true });
    useFakeBx(fake, "");
    writeWebSearchSetting(fake.cwd, true);
    const pi = createPiMock();
    webExtension(pi as never);
    await pi.emit("session_start", { reason: "startup" }, makeCtx({ cwd: fake.cwd }));
    const tool = getTool(pi, "web_search") as unknown as WebSearchTool;
    const controller = new AbortController();
    const pending = tool.execute(
      "call-8",
      { query: "cancel me" },
      controller.signal,
      undefined,
      makeCtx({ cwd: fake.cwd }),
    );

    controller.abort();
    await expect(pending).rejects.toThrow("cancelled");
  });

  it("saves complete formatted overflow output", async () => {
    const excerpt = Array.from({ length: 2001 }, (_, index) => `line ${index}`).join("\n");
    useFakeBx(
      fake,
      JSON.stringify({
        grounding: {
          generic: [
            { title: "Large source", url: "https://example.test/large", snippets: [excerpt] },
          ],
        },
      }),
    );
    writeWebSearchSetting(fake.cwd, true);
    const pi = createPiMock();
    webExtension(pi as never);
    await pi.emit("session_start", { reason: "startup" }, makeCtx({ cwd: fake.cwd }));
    const tool = getTool(pi, "web_search") as unknown as WebSearchTool;
    const result = (await tool.execute(
      "call-9",
      { query: "large" },
      undefined,
      undefined,
      makeCtx({ cwd: fake.cwd }),
    )) as { content: Array<{ text: string }>; details: { fullOutputPath?: string } };

    expect(result.content[0]?.text).toContain("Output truncated");
    expect(result.details.fullOutputPath).toBeDefined();
    expect(readFileSync(result.details.fullOutputPath as string, "utf8")).toContain("line 2000");
  });
});
