// Behavior tests for the ask-user extension's execute path: concurrency guard,
// no-UI error path, validation errors, unsupported custom overlay.

import { describe, expect, it, vi } from "vitest";
import askUserExtension from "../src/ask-user.ts";
import type { QuestionnaireOutcome } from "../src/types.ts";

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

function richCtx(outcome: QuestionnaireOutcome | undefined | Promise<QuestionnaireOutcome>) {
  return {
    hasUI: true,
    ui: {
      custom: vi.fn(async () => outcome),
    },
    abort: vi.fn(),
  };
}

describe("ask_user execute", () => {
  it("returns a clear error when no UI is available", async () => {
    const { tool } = fakePi();
    const ctx = {
      hasUI: false,
      ui: {},
    };
    const result = await tool.execute("id", validParams, undefined, undefined, ctx);
    expect(result.content[0].text).toMatch(/requires interactive UI/);
  });

  it("returns an explicit error when custom overlay is unavailable", async () => {
    const { tool } = fakePi();
    const ctx = {
      hasUI: true,
      ui: {},
      abort: vi.fn(),
    };
    const result = await tool.execute("id", validParams, undefined, undefined, ctx);
    expect(result.content[0].text).toMatch(/requires a TUI with custom overlay support/);
  });

  it("rejects validation errors with a clear message", async () => {
    const { tool } = fakePi();
    const ctx = richCtx({ terminalState: "cancelled", answers: [] });
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
    let resolveFirst: ((value: QuestionnaireOutcome) => void) | undefined;
    const firstPromise = new Promise<QuestionnaireOutcome>((resolve) => {
      resolveFirst = resolve;
    });
    const firstCtx = richCtx(firstPromise);
    const firstExecPromise = tool.execute("a", validParams, undefined, undefined, firstCtx);

    const secondCtx = richCtx({ terminalState: "cancelled", answers: [] });
    const secondResult = await tool.execute("b", validParams, undefined, undefined, secondCtx);
    expect(secondResult.content[0].text).toMatch(/already in flight/);

    resolveFirst?.({ terminalState: "cancelled", answers: [] });
    await firstExecPromise;
  });

  it("releases the lock after the first call so a follow-up call works", async () => {
    const { tool } = fakePi();
    const cancelledCtx = richCtx({ terminalState: "cancelled", answers: [] });
    await tool.execute("a", validParams, undefined, undefined, cancelledCtx);

    const submitCtx = richCtx({
      terminalState: "submitted",
      answers: [{ questionId: "scope", source: "option", value: "a", optionIndex: 0 }],
    });
    const result = await tool.execute("b", validParams, undefined, undefined, submitCtx);
    expect(result.details).toMatchObject({ terminalState: "submitted" });
  });

  it("calls abort when the user cancels the questionnaire", async () => {
    const { tool } = fakePi();
    const ctx = richCtx({ terminalState: "cancelled", answers: [] });
    const result = await tool.execute("id", validParams, undefined, undefined, ctx);
    expect(result.details).toMatchObject({ terminalState: "cancelled" });
    expect(ctx.abort).toHaveBeenCalledOnce();
  });

  it("does not call abort when the user submits the questionnaire", async () => {
    const { tool } = fakePi();
    const ctx = richCtx({
      terminalState: "submitted",
      answers: [{ questionId: "scope", source: "option", value: "a", optionIndex: 0 }],
    });
    const result = await tool.execute("id", validParams, undefined, undefined, ctx);
    expect(result.details).toMatchObject({ terminalState: "submitted" });
    expect(ctx.abort).not.toHaveBeenCalled();
  });
});
