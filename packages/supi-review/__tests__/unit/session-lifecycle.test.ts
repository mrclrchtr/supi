import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChildLifecycleTrace } from "../../src/tool/child-lifecycle-trace.ts";
import { runWithLifecycle } from "../../src/tool/session-lifecycle.ts";
import type { ChildFailureDiagnostics } from "../../src/types.ts";

function createSession() {
  return {
    subscribe: vi.fn(() => vi.fn()),
    prompt: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
    dispose: vi.fn(),
    getActiveToolNames: vi.fn(() => ["read"]),
  } as unknown as AgentSession;
}

describe("runWithLifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets an in-flight cancellation win a timeout race", async () => {
    vi.useFakeTimers();
    const session = createSession();
    const controller = new AbortController();
    const onTimeout = vi.fn();
    let finishAbort: (() => void) | undefined;
    vi.mocked(session.abort).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishAbort = resolve;
        }),
    );

    const resultPromise = runWithLifecycle({
      session,
      prompt: "wait for cancellation",
      signal: controller.signal,
      timeoutMs: 10,
      onEvent: () => {},
      onTimeout,
      canceledResult: () => "canceled" as const,
      failedResult: () => "failed" as const,
      timeoutResult: () => "timeout" as const,
    });

    controller.abort();
    await vi.advanceTimersByTimeAsync(20);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(session.abort).toHaveBeenCalledTimes(1);

    finishAbort?.();
    await expect(resultPromise).resolves.toBe("canceled");
  });

  it("cancels when the signal aborted before lifecycle wiring completed", async () => {
    vi.useFakeTimers();
    const session = createSession();
    const controller = new AbortController();
    controller.abort();

    const resultPromise = runWithLifecycle({
      session,
      prompt: "should not run",
      signal: controller.signal,
      timeoutMs: 10,
      onEvent: () => {},
      canceledResult: () => "canceled" as const,
      failedResult: () => "failed" as const,
      timeoutResult: () => "timeout" as const,
    });

    await vi.advanceTimersByTimeAsync(20);
    await expect(resultPromise).resolves.toBe("canceled");
    expect(session.abort).toHaveBeenCalledTimes(1);
    expect(session.prompt).not.toHaveBeenCalled();
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it("records agent_settled before an event handler finalizes the run", async () => {
    const session = createSession();
    let listener: ((event: { type: string }) => void) | undefined;
    let trace: unknown;
    vi.mocked(session.subscribe).mockImplementation((callback) => {
      listener = callback as (event: { type: string }) => void;
      return vi.fn();
    });

    const resultPromise = runWithLifecycle({
      session,
      prompt: "wait for settlement",
      timeoutMs: 1_000,
      onEvent: (event, ctx) => {
        if (event.type !== "agent_settled") return;
        trace = ctx.getLifecycleTrace();
        ctx.resolve(ctx.cleanup("settled"));
      },
      canceledResult: () => "canceled",
      failedResult: () => "failed",
      timeoutResult: () => "timeout",
    });

    listener?.({ type: "agent_settled" });

    await expect(resultPromise).resolves.toBe("settled");
    expect(trace).toEqual({ entries: [{ type: "agent_settled" }], droppedCount: 0 });
  });

  it("omits unregistered tool activity from lifecycle diagnostics", async () => {
    const session = createSession();
    let listener: ((event: { type: string; [key: string]: unknown }) => void) | undefined;
    vi.mocked(session.subscribe).mockImplementation((callback) => {
      listener = callback as (event: { type: string; [key: string]: unknown }) => void;
      return vi.fn();
    });

    const resultPromise = runWithLifecycle<ChildFailureDiagnostics>({
      session,
      prompt: "filter activity",
      timeoutMs: 1_000,
      onEvent: (event, ctx) => {
        if (event.type === "agent_settled") {
          ctx.resolve(ctx.cleanup(ctx.getFailureDiagnostics()));
        }
      },
      canceledResult: (ctx) => ctx.getFailureDiagnostics(),
      failedResult: (_code, ctx) => ctx.getFailureDiagnostics(),
      timeoutResult: (_timeoutMs, ctx) => ctx.getFailureDiagnostics(),
    });

    listener?.({
      type: "tool_execution_start",
      toolName: "private_unregistered_tool",
      args: { private: "tool argument" },
    });
    listener?.({ type: "tool_execution_start", toolName: "read", args: {} });
    listener?.({ type: "agent_settled" });

    const diagnostics = await resultPromise;
    expect(diagnostics.recentActivity).toEqual(["tool:start:read"]);
    expect(JSON.stringify(diagnostics)).not.toContain("private_unregistered_tool");
  });

  it("fails closed when active-tool lookup throws", async () => {
    const session = createSession();
    vi.mocked(session.getActiveToolNames).mockImplementation(() => {
      throw new Error("private active tool lookup error");
    });
    let listener: ((event: { type: string; [key: string]: unknown }) => void) | undefined;
    vi.mocked(session.subscribe).mockImplementation((callback) => {
      listener = callback as (event: { type: string; [key: string]: unknown }) => void;
      return vi.fn();
    });

    const resultPromise = runWithLifecycle<ChildFailureDiagnostics>({
      session,
      prompt: "filter failed lookup",
      timeoutMs: 1_000,
      onEvent: (event, ctx) => {
        if (event.type === "agent_settled") {
          ctx.resolve(ctx.cleanup(ctx.getFailureDiagnostics()));
        }
      },
      canceledResult: (ctx) => ctx.getFailureDiagnostics(),
      failedResult: (_code, ctx) => ctx.getFailureDiagnostics(),
      timeoutResult: (_timeoutMs, ctx) => ctx.getFailureDiagnostics(),
    });

    listener?.({
      type: "tool_execution_start",
      toolName: "private_unregistered_tool",
      args: { private: "tool argument" },
    });
    listener?.({
      type: "tool_execution_end",
      toolName: "private_unregistered_tool",
      args: { private: "tool argument" },
      result: { content: "private tool result" },
      isError: true,
    });
    listener?.({ type: "agent_settled" });

    const diagnostics = await resultPromise;
    expect(diagnostics.recentActivity).toBeUndefined();
    expect(JSON.stringify(diagnostics)).not.toContain("private active tool lookup error");
    expect(JSON.stringify(diagnostics)).not.toContain("private_unregistered_tool");
    expect(JSON.stringify(diagnostics)).not.toContain("private tool argument");
    expect(JSON.stringify(diagnostics)).not.toContain("private tool result");
  });

  it("records a cancellation abort marker before producing the canceled result", async () => {
    const session = createSession();
    const controller = new AbortController();

    const resultPromise = runWithLifecycle<ChildLifecycleTrace>({
      session,
      prompt: "wait for cancellation",
      signal: controller.signal,
      timeoutMs: 1_000,
      onEvent: () => {},
      canceledResult: (ctx) => ctx.getLifecycleTrace(),
      failedResult: () => ({ entries: [], droppedCount: 0 }),
      timeoutResult: () => ({ entries: [], droppedCount: 0 }),
    });

    controller.abort();

    await expect(resultPromise).resolves.toEqual({
      entries: [{ type: "abort_requested", reason: "canceled" }],
      droppedCount: 0,
    });
  });

  it("records timeout and abort markers before producing the timeout result", async () => {
    vi.useFakeTimers();
    const session = createSession();

    const resultPromise = runWithLifecycle<ChildLifecycleTrace>({
      session,
      prompt: "wait for timeout",
      timeoutMs: 10,
      onEvent: () => {},
      canceledResult: () => ({ entries: [], droppedCount: 0 }),
      failedResult: () => ({ entries: [], droppedCount: 0 }),
      timeoutResult: (_timeoutMs, ctx) => ctx.getLifecycleTrace(),
    });

    await vi.advanceTimersByTimeAsync(10);

    await expect(resultPromise).resolves.toEqual({
      entries: [{ type: "timeout_expired" }, { type: "abort_requested", reason: "timeout" }],
      droppedCount: 0,
    });
  });

  it("classifies a custom timeout-handler failure without retaining the thrown error", async () => {
    vi.useFakeTimers();
    const session = createSession();

    const resultPromise = runWithLifecycle<{ code: string; trace: ChildLifecycleTrace }>({
      session,
      prompt: "trigger timeout handler failure",
      timeoutMs: 10,
      onEvent: () => {},
      onTimeout: () => {
        throw new Error("private timeout handler exception");
      },
      canceledResult: () => ({ code: "canceled", trace: { entries: [], droppedCount: 0 } }),
      failedResult: (code, ctx) => ({ code, trace: ctx.getLifecycleTrace() }),
      timeoutResult: () => ({ code: "timeout", trace: { entries: [], droppedCount: 0 } }),
    });

    await vi.advanceTimersByTimeAsync(10);

    await expect(resultPromise).resolves.toEqual({
      code: "unexpected-runner-failure",
      trace: {
        entries: [{ type: "timeout_expired" }],
        droppedCount: 0,
      },
    });
  });

  it("classifies prompt preflight rejection without retaining the rejection error", async () => {
    const session = createSession();
    vi.mocked(session.prompt).mockImplementation(async (_prompt, options) => {
      if (!options?.preflightResult) throw new Error("missing preflight callback");
      options.preflightResult(false);
    });

    const result = await runWithLifecycle<{ code: string; trace: ChildLifecycleTrace }>({
      session,
      prompt: "reject this prompt",
      timeoutMs: 1_000,
      onEvent: () => {},
      canceledResult: () => ({ code: "canceled", trace: { entries: [], droppedCount: 0 } }),
      failedResult: (code, ctx) => ({ code, trace: ctx.getLifecycleTrace() }),
      timeoutResult: () => ({ code: "timeout", trace: { entries: [], droppedCount: 0 } }),
    });

    expect(result).toEqual({
      code: "prompt-rejected",
      trace: {
        entries: [{ type: "prompt_rejected" }],
        droppedCount: 0,
      },
    });
  });

  it("lets an accepted prompt rejection override deferred settlement", async () => {
    const session = createSession();
    let listener: ((event: { type: string }) => void) | undefined;
    let rejectPrompt: ((error: Error) => void) | undefined;
    vi.mocked(session.subscribe).mockImplementation((callback) => {
      listener = callback as (event: { type: string }) => void;
      return vi.fn();
    });
    vi.mocked(session.prompt).mockImplementation(
      (_prompt, options) =>
        new Promise<void>((_resolve, reject) => {
          options?.preflightResult?.(true);
          rejectPrompt = reject;
        }),
    );

    const resultPromise = runWithLifecycle<{ code: string; trace: ChildLifecycleTrace }>({
      session,
      prompt: "fail after acceptance",
      timeoutMs: 1_000,
      onEvent: (event, ctx) => {
        if (event.type !== "agent_settled") return;
        ctx.resolve(
          ctx.cleanup({ code: "missing-structured-output", trace: ctx.getLifecycleTrace() }),
        );
      },
      canceledResult: () => ({ code: "canceled", trace: { entries: [], droppedCount: 0 } }),
      failedResult: (code, ctx) => ({ code, trace: ctx.getLifecycleTrace() }),
      timeoutResult: () => ({ code: "timeout", trace: { entries: [], droppedCount: 0 } }),
    });

    listener?.({ type: "agent_settled" });
    rejectPrompt?.(new Error("private accepted-run failure"));

    await expect(resultPromise).resolves.toEqual({
      code: "unexpected-runner-failure",
      trace: {
        entries: [{ type: "agent_settled" }],
        droppedCount: 0,
      },
    });
  });

  it("lets an in-flight cancellation own a later accepted-prompt rejection", async () => {
    const session = createSession();
    const controller = new AbortController();
    let rejectPrompt: ((error: Error) => void) | undefined;
    let finishAbort: (() => void) | undefined;
    vi.mocked(session.prompt).mockImplementation(
      (_prompt, options) =>
        new Promise<void>((_resolve, reject) => {
          options?.preflightResult?.(true);
          rejectPrompt = reject;
        }),
    );
    vi.mocked(session.abort).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishAbort = resolve;
        }),
    );

    const resultPromise = runWithLifecycle({
      session,
      prompt: "cancel accepted prompt",
      signal: controller.signal,
      timeoutMs: 1_000,
      onEvent: () => {},
      canceledResult: () => "canceled" as const,
      failedResult: () => "failed" as const,
      timeoutResult: () => "timeout" as const,
    });

    controller.abort();
    rejectPrompt?.(new Error("private accepted-run failure"));
    await Promise.resolve();
    finishAbort?.();

    await expect(resultPromise).resolves.toBe("canceled");
  });

  it("classifies runner event-handler failures without retaining the thrown error", async () => {
    const session = createSession();
    let listener: ((event: { type: string }) => void) | undefined;
    vi.mocked(session.subscribe).mockImplementation((callback) => {
      listener = callback as (event: { type: string }) => void;
      return vi.fn();
    });

    const resultPromise = runWithLifecycle<{ code: string; trace: ChildLifecycleTrace }>({
      session,
      prompt: "trigger a runner failure",
      timeoutMs: 1_000,
      onEvent: () => {
        throw new Error("private runner exception");
      },
      canceledResult: () => ({ code: "canceled", trace: { entries: [], droppedCount: 0 } }),
      failedResult: (code, ctx) => ({ code, trace: ctx.getLifecycleTrace() }),
      timeoutResult: () => ({ code: "timeout", trace: { entries: [], droppedCount: 0 } }),
    });

    expect(() => listener?.({ type: "agent_start" })).not.toThrow();
    await expect(resultPromise).resolves.toEqual({
      code: "unexpected-runner-failure",
      trace: {
        entries: [{ type: "agent_start" }],
        droppedCount: 0,
      },
    });
  });
});
