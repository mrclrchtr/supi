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

function fakePi(): {
  tool: MockTool;
  appendEntry: ReturnType<typeof vi.fn>;
  getSessionName: ReturnType<typeof vi.fn>;
  events: { emit: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> };
} {
  let captured: MockTool | null = null;
  const appendEntry = vi.fn();
  const getSessionName = vi.fn(() => undefined);
  const events = { emit: vi.fn(), on: vi.fn() };
  const api = {
    registerTool: (def: MockTool) => {
      captured = def;
    },
    on() {},
    appendEntry,
    getSessionName,
    events,
  };
  // biome-ignore lint/suspicious/noExplicitAny: registering a partial ExtensionAPI is intentional in tests
  askUserExtension(api as any);
  if (!captured) throw new Error("askUserExtension did not register a tool");
  return { tool: captured, appendEntry, getSessionName, events };
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
      {
        questions: [
          { type: "choice", id: "x", header: "X", prompt: "X", multi: true, options: [] },
        ],
      },
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
      answers: [
        { questionId: "scope", source: "choice", selections: [{ value: "a", optionIndex: 0 }] },
      ],
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
      answers: [
        { questionId: "scope", source: "choice", selections: [{ value: "a", optionIndex: 0 }] },
      ],
    });
    const result = await tool.execute("id", validParams, undefined, undefined, ctx);
    expect(result.details).toMatchObject({ terminalState: "submitted" });
    expect(ctx.abort).not.toHaveBeenCalled();
  });

  it("appends a tree-friendly custom entry with question headers for submitted questionnaires", async () => {
    const { tool, appendEntry } = fakePi();
    const ctx = richCtx({
      terminalState: "submitted",
      answers: [
        { questionId: "scope", source: "choice", selections: [{ value: "a", optionIndex: 0 }] },
      ],
    });
    await tool.execute("id", validParams, undefined, undefined, ctx);
    expect(appendEntry).toHaveBeenCalledOnce();
    expect(appendEntry).toHaveBeenCalledWith("ask_user · 1 question · Scope");
  });

  it("appends a tree-friendly custom entry for skipped questionnaires too", async () => {
    const { tool, appendEntry } = fakePi();
    const ctx = richCtx({
      terminalState: "skipped",
      answers: [
        { questionId: "scope", source: "choice", selections: [{ value: "a", optionIndex: 0 }] },
      ],
      skipped: true,
    });
    await tool.execute("id", validParams, undefined, undefined, ctx);
    expect(appendEntry).toHaveBeenCalledOnce();
    expect(appendEntry).toHaveBeenCalledWith("ask_user · 1 question · Scope");
  });

  it("truncates long header lists in the tree summary label", async () => {
    const { tool, appendEntry } = fakePi();
    const longParams = {
      questions: [
        { type: "text", id: "a", header: "A".repeat(40), prompt: "A" },
        { type: "text", id: "b", header: "B".repeat(40), prompt: "B" },
      ],
    };
    const ctx = richCtx({
      terminalState: "submitted",
      answers: [
        { questionId: "a", source: "text" as const, value: "x" },
        { questionId: "b", source: "text" as const, value: "y" },
      ],
    });
    await tool.execute("id", longParams, undefined, undefined, ctx);
    expect(appendEntry).toHaveBeenCalledOnce();
    const label = appendEntry.mock.calls[0][0];
    expect(label).toMatch(/^ask_user/);
    expect(label.endsWith("...")).toBe(true);
  });

  it("emits supi:ask-user:start before the overlay and supi:ask-user:end after it resolves", async () => {
    const { tool, events } = fakePi();
    const ctx = richCtx({
      terminalState: "submitted",
      answers: [
        { questionId: "scope", source: "choice", selections: [{ value: "a", optionIndex: 0 }] },
      ],
    });
    await tool.execute("id", validParams, undefined, undefined, ctx);

    expect(events.emit).toHaveBeenCalledWith("supi:ask-user:start", { source: "supi-ask-user" });
    expect(events.emit).toHaveBeenCalledWith("supi:ask-user:end", { source: "supi-ask-user" });

    // start must appear before end in the call order
    const calls = events.emit.mock.calls as [[string, unknown]];
    const startIdx = calls.findIndex(([name]) => name === "supi:ask-user:start");
    const endIdx = calls.findIndex(([name]) => name === "supi:ask-user:end");
    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(endIdx).toBeGreaterThan(startIdx);
  });
});
