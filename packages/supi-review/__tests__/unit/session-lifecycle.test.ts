import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runWithLifecycle } from "../../src/tool/session-lifecycle.ts";

function createSession() {
  return {
    subscribe: vi.fn(() => vi.fn()),
    prompt: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
    dispose: vi.fn(),
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
});
