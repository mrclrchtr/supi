import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { registerCodeIntelligenceTools } from "../../../../src/tool/register.ts";
import type { CodeIntelligenceToolDefinitionSpec } from "../../../../src/tool/specs.ts";
import { sessionCache } from "../../../helpers/execute-action.ts";

/**
 * Fake spec factory: a code_find-shaped spec whose `run` captures the ctx it
 * receives and returns controlled content/details for adapter assertions.
 */
function fakeSpec(
  run: CodeIntelligenceToolDefinitionSpec["run"],
): CodeIntelligenceToolDefinitionSpec {
  return {
    name: "code_find",
    label: "Fake Find",
    parameters: Type.Object({}, { additionalProperties: false }),
    run,
  };
}

describe("registerCodeIntelligenceTools adapter", () => {
  it("forwards cwd, signal, and onUpdate from the pi execute() call to spec.run", async () => {
    const pi = createPiMock();
    const captured: Array<{ cwd: string; signal?: AbortSignal; onUpdate?: unknown }> = [];
    registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate, undefined, [
      fakeSpec(async (_params, ctx) => {
        captured.push({ cwd: ctx.cwd, signal: ctx.signal, onUpdate: ctx.onUpdate });
        return { content: "ok" };
      }),
    ]);

    const tool = getTool(pi, "code_find") as {
      execute: (...args: unknown[]) => Promise<{ content: Array<{ text: string }> }>;
    };
    const ac = new AbortController();
    const onUpdate = (): void => {};
    await tool.execute("t", {}, ac.signal, onUpdate, makeCtx({ cwd: "/tmp/x" }));

    expect(captured).toHaveLength(1);
    expect(captured[0].cwd).toBe("/tmp/x");
    expect(captured[0].signal).toBe(ac.signal);
    expect(captured[0].onUpdate).toBe(onUpdate);
  });

  it("head-truncates oversized content with a notice and passes details through untouched", async () => {
    const pi = createPiMock();
    const big = `${Array.from({ length: 3000 }, (_, i) => `line ${i}`).join("\n")}\n`;
    registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate, undefined, [
      fakeSpec(async () => ({
        content: big,
        details: {
          type: "search" as const,
          data: {
            confidence: "structural" as const,
            scope: null,
            candidateCount: 0,
            omittedCount: 0,
            nextQueries: [],
          },
        },
      })),
    ]);

    const tool = getTool(pi, "code_find") as {
      execute: (
        ...args: unknown[]
      ) => Promise<{ content: Array<{ text: string }>; details?: unknown }>;
    };
    const res = await tool.execute("t", {}, undefined, undefined, makeCtx({ cwd: "/tmp" }));

    const text = res.content[0].text;
    expect(text).toMatch(/\[truncated: kept \d+ of \d+ lines \([^)]+\)\]/);
    expect(text.startsWith("line 0\n")).toBe(true);
    // details passed through untouched (not truncated)
    expect(res.details).toMatchObject({ type: "search", data: { candidateCount: 0 } });
  });

  it("leaves short content unchanged (no notice)", async () => {
    const pi = createPiMock();
    registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate, undefined, [
      fakeSpec(async () => ({ content: "small result" })),
    ]);
    const tool = getTool(pi, "code_find") as {
      execute: (...args: unknown[]) => Promise<{ content: Array<{ text: string }> }>;
    };
    const res = await tool.execute("t", {}, undefined, undefined, makeCtx({ cwd: "/tmp" }));
    expect(res.content[0].text).toBe("small result");
  });
});
