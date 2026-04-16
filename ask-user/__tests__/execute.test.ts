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
      options: [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
      ],
    },
  ],
};

type SelectImpl = (title: string, options: string[]) => Promise<string | undefined>;

function fallbackCtx(selectImpl: SelectImpl) {
  return {
    hasUI: true,
    ui: {
      select: vi.fn(selectImpl),
      confirm: vi.fn(async () => false),
      input: vi.fn(async () => undefined),
    },
  };
}

describe("ask_user execute", () => {
  it("returns a clear error when no UI is available", async () => {
    const { tool } = fakePi();
    const ctx = {
      hasUI: false,
      ui: {
        select: async () => undefined,
        confirm: async () => false,
        input: async () => undefined,
      },
    };
    const result = await tool.execute("id", validParams, undefined, undefined, ctx);
    expect(result.content[0].text).toMatch(/requires interactive UI/);
  });

  it("rejects validation errors with a clear message", async () => {
    const { tool } = fakePi();
    const ctx = fallbackCtx(async () => undefined);
    const result = await tool.execute("id", { questions: [] }, undefined, undefined, ctx);
    expect(result.content[0].text).toMatch(/1-4 questions/);
  });

  it("rejects a second concurrent ask_user call with an explicit error", async () => {
    const { tool } = fakePi();
    let resolveFirst: ((v: string | undefined) => void) | undefined;
    const firstCtx = fallbackCtx(
      () =>
        new Promise<string | undefined>((res) => {
          resolveFirst = res;
        }),
    );
    const firstPromise = tool.execute("a", validParams, undefined, undefined, firstCtx);

    // Second call while the first is still in flight
    const secondCtx = fallbackCtx(async () => undefined);
    const secondResult = await tool.execute("b", validParams, undefined, undefined, secondCtx);
    expect(secondResult.content[0].text).toMatch(/already in flight/);

    resolveFirst?.(undefined); // let the first call resolve as cancelled
    await firstPromise;
  });

  it("releases the lock after the first call so a follow-up call works", async () => {
    const { tool } = fakePi();
    const ctxOne = fallbackCtx(async () => undefined); // cancel
    await tool.execute("a", validParams, undefined, undefined, ctxOne);
    const ctxTwo = fallbackCtx(async (_t: string, options: string[] | undefined) => options?.[0]);
    const result = await tool.execute("b", validParams, undefined, undefined, ctxTwo);
    expect(result.details).toMatchObject({ terminalState: "submitted" });
  });
});
