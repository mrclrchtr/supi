import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runReviewer } from "../runner.ts";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

describe("runReviewer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("constructs read-only tool allowlist", async () => {
    const mockProc = createMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as never);

    const promise = runReviewer({
      prompt: "review this",
      model: "openai/gpt-4o",
      cwd: "/tmp",
      target: { type: "custom", instructions: "review this" },
    });

    mockProc.stdout?.emit("data", `${assistantMessageEnd()}\n`);
    mockProc.emit("exit", 0);

    const result = await promise;
    expect(result.kind).toBe("success");

    const args = vi.mocked(spawn).mock.calls[0]?.[1] as string[];
    expect(args).toContain("--tools");
    const toolsIndex = args.indexOf("--tools");
    expect(args[toolsIndex + 1]).toBe("read,grep,find,ls");
  });

  it("omits --model when no model is resolved", async () => {
    const mockProc = createMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as never);

    const promise = runReviewer({
      prompt: "review this",
      model: undefined,
      cwd: "/tmp",
      target: { type: "custom", instructions: "review this" },
    });

    mockProc.stdout?.emit("data", `${assistantMessageEnd()}\n`);
    mockProc.emit("exit", 0);

    await promise;
    const args = vi.mocked(spawn).mock.calls[0]?.[1] as string[];
    expect(args).not.toContain("--model");
  });

  it("includes --mode json and --no-session", async () => {
    const mockProc = createMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as never);

    const promise = runReviewer({
      prompt: "review this",
      model: "test-model",
      cwd: "/tmp",
      target: { type: "custom", instructions: "review this" },
    });

    mockProc.stdout?.emit("data", `${assistantMessageEnd()}\n`);
    mockProc.emit("exit", 0);

    await promise;
    const args = vi.mocked(spawn).mock.calls[0]?.[1] as string[];
    expect(args).toContain("--mode");
    expect(args).toContain("json");
    expect(args).toContain("--no-session");
  });

  it("returns canceled immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runReviewer({
      prompt: "review",
      model: undefined,
      cwd: "/tmp",
      signal: controller.signal,
      target: { type: "custom", instructions: "review" },
    });

    expect(result.kind).toBe("canceled");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("handles spawn errors gracefully", async () => {
    const mockProc = createMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as never);

    const promise = runReviewer({
      prompt: "review",
      model: undefined,
      cwd: "/tmp",
      target: { type: "custom", instructions: "review" },
    });

    mockProc.emit("error", new Error("ENOENT"));

    const result = await promise;
    expect(result.kind).toBe("failed");
    expect((result as Extract<typeof result, { kind: "failed" }>).reason).toContain("spawn");
  });

  it("handles non-zero exit gracefully", async () => {
    const mockProc = createMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as never);

    const promise = runReviewer({
      prompt: "review",
      model: undefined,
      cwd: "/tmp",
      target: { type: "custom", instructions: "review" },
    });

    mockProc.stderr?.emit("data", "some error");
    mockProc.emit("exit", 1);

    const result = await promise;
    expect(result.kind).toBe("failed");
    expect((result as Extract<typeof result, { kind: "failed" }>).stderr).toBe("some error");
  });

  it("handles timeout", async () => {
    const mockProc = createMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as never);

    const promise = runReviewer({
      prompt: "review",
      model: undefined,
      cwd: "/tmp",
      target: { type: "custom", instructions: "review" },
      options: { timeout: 1000 },
    });

    vi.advanceTimersByTime(2000);

    const result = await promise;
    expect(result.kind).toBe("timeout");
  });

  it("handles abort signal", async () => {
    vi.useRealTimers();
    const mockProc = createMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as never);

    const controller = new AbortController();
    const promise = runReviewer({
      prompt: "review",
      model: undefined,
      cwd: "/tmp",
      signal: controller.signal,
      target: { type: "custom", instructions: "review" },
    });

    controller.abort();
    await new Promise((r) => setTimeout(r, 10));
    mockProc.emit("exit", null, "SIGTERM");

    const result = await promise;
    expect(result.kind).toBe("canceled");
    vi.useFakeTimers();
  });

  it("handles missing assistant output", async () => {
    const mockProc = createMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as never);

    const promise = runReviewer({
      prompt: "review",
      model: undefined,
      cwd: "/tmp",
      target: { type: "custom", instructions: "review" },
    });

    mockProc.stdout?.emit("data", `${JSON.stringify({ type: "turn_end" })}\n`);
    mockProc.emit("exit", 0);

    const result = await promise;
    expect(result.kind).toBe("failed");
    expect((result as Extract<typeof result, { kind: "failed" }>).reason).toContain(
      "no assistant output",
    );
  });
});

function assistantMessageEnd(content = defaultReviewJson()): string {
  return JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content,
    },
  });
}

function defaultReviewJson(): string {
  return '{"findings":[],"overall_correctness":"ok","overall_explanation":"x","overall_confidence_score":0.5}';
}

function createMockProc() {
  const listeners: Record<string, Array<(arg?: unknown) => void>> = {};
  const stdoutListeners: Record<string, Array<(arg?: unknown) => void>> = {};
  const stderrListeners: Record<string, Array<(arg?: unknown) => void>> = {};

  const on = (event: string, fn: (arg?: unknown) => void) => {
    listeners[event] = listeners[event] || [];
    listeners[event].push(fn);
  };

  const emit = (event: string, ...args: unknown[]) => {
    for (const fn of listeners[event] || []) {
      fn(...args);
    }
  };

  const stdout = {
    setEncoding: () => {},
    on: (event: string, fn: (arg?: unknown) => void) => {
      stdoutListeners[event] = stdoutListeners[event] || [];
      stdoutListeners[event].push(fn);
    },
    emit: (event: string, arg?: unknown) => {
      for (const fn of stdoutListeners[event] || []) {
        fn(arg);
      }
    },
  };

  const stderr = {
    setEncoding: () => {},
    on: (event: string, fn: (arg?: unknown) => void) => {
      stderrListeners[event] = stderrListeners[event] || [];
      stderrListeners[event].push(fn);
    },
    emit: (event: string, arg?: unknown) => {
      for (const fn of stderrListeners[event] || []) {
        fn(arg);
      }
    },
  };

  return {
    on,
    emit,
    stdout,
    stderr,
    kill: vi.fn(),
    killed: false,
  };
}
