// Behavior tests for the ask-user extension's execute path: concurrency guard,
// no-UI error path, validation errors, fallback selection.

import { describe, expect, it, vi } from "vitest";
import askUserExtension from "../ask-user.ts";

interface MockTool {
  name: string;
  execute: (
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: unknown,
  ) => Promise<{ content: { type: string; text: string }[]; details: unknown }>;
}

function fakePi(): { tool: MockTool } {
  let captured: MockTool | null = null;
  const api = {
    registerTool: (def: MockTool) => {
      captured = def;
    },
    on() {},
  };
  // biome-ignore lint/suspicious/noExplicitAny: registering a partial ExtensionAPI is intentional in tests
  askUserExtension(api as any);
  if (!captured) throw new Error("askUserExtension did not register a tool");
  return { tool: captured };
}

const validParams = {
  questions: [
    {
      type: "choice",
      id: "scope",
      header: "Scope",
      prompt: "Pick scope",
      allowOther: true,
      allowDiscuss: true,
      options: [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
      ],
    },
  ],
};

type SelectImpl = (title: string, options: string[]) => Promise<string | undefined>;

type InputImpl = (title: string, placeholder?: string) => Promise<string | undefined>;

function fallbackCtx(selectImpl: SelectImpl, inputImpl?: InputImpl) {
  return {
    hasUI: true,
    ui: {
      select: vi.fn(selectImpl),
      input: vi.fn(inputImpl ?? (async () => undefined)),
    },
    abort: vi.fn(),
  };
}

describe("ask_user execute", () => {
  it("returns a clear error when no UI is available", async () => {
    const { tool } = fakePi();
    const ctx = {
      hasUI: false,
      ui: {
        select: async () => undefined,
        input: async () => undefined,
      },
    };
    const result = await tool.execute("id", validParams, undefined, undefined, ctx);
    expect(result.content[0].text).toMatch(/requires interactive UI/);
  });

  it("rejects validation errors with a clear message", async () => {
    const { tool } = fakePi();
    const ctx = fallbackCtx(async () => undefined);
    const result = await tool.execute(
      "id",
      { questions: [{ type: "multichoice", id: "x", header: "X", prompt: "X", options: [] }] },
      undefined,
      undefined,
      ctx,
    );
    expect(result.content[0].text).toMatch(/2-12 options|structured question/);
  });

  it("rejects a second concurrent ask_user call with an explicit error", async () => {
    const { tool } = fakePi();
    let resolveFirst: ((value: string | undefined) => void) | undefined;
    const firstCtx = fallbackCtx(
      () =>
        new Promise<string | undefined>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const firstPromise = tool.execute("a", validParams, undefined, undefined, firstCtx);

    const secondCtx = fallbackCtx(async () => undefined);
    const secondResult = await tool.execute("b", validParams, undefined, undefined, secondCtx);
    expect(secondResult.content[0].text).toMatch(/already in flight/);

    resolveFirst?.(undefined);
    await firstPromise;
  });

  it("releases the lock after the first call so a follow-up call works", async () => {
    const { tool } = fakePi();
    const cancelledCtx = fallbackCtx(async () => undefined);
    await tool.execute("a", validParams, undefined, undefined, cancelledCtx);

    const submitCtx = fallbackCtx(async (_title, options) => options[0]);
    const result = await tool.execute("b", validParams, undefined, undefined, submitCtx);
    expect(result.details).toMatchObject({ terminalState: "submitted" });
  });

  it("calls abort when the user cancels the questionnaire", async () => {
    const { tool } = fakePi();
    const ctx = fallbackCtx(async () => undefined);
    const result = await tool.execute("id", validParams, undefined, undefined, ctx);
    expect(result.details).toMatchObject({ terminalState: "cancelled" });
    expect(ctx.abort).toHaveBeenCalledOnce();
  });

  it("does not call abort when the user submits the questionnaire", async () => {
    const { tool } = fakePi();
    const ctx = fallbackCtx(async (_title, options) => options[0]);
    const result = await tool.execute("id", validParams, undefined, undefined, ctx);
    expect(result.details).toMatchObject({ terminalState: "submitted" });
    expect(ctx.abort).not.toHaveBeenCalled();
  });

  it("can return a discuss answer through the fallback path", async () => {
    const { tool } = fakePi();
    const ctx = fallbackCtx(
      async (_title, options) => options[3],
      async () => "need more context",
    );
    const result = await tool.execute("id", validParams, undefined, undefined, ctx);
    expect(result.details).toMatchObject({
      terminalState: "submitted",
      answers: [{ source: "discuss", value: "need more context" }],
    });
  });
});
