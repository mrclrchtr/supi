import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runReviewer } from "../src/runner.ts";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    existsSync: vi.fn(),
    readFileSync: vi.fn((path: unknown, encoding?: BufferEncoding) => {
      if (String(path).endsWith("review-prompt.md")) {
        return actual.readFileSync(path as string, encoding ?? "utf-8");
      }
      return undefined;
    }),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

vi.mock("node:crypto", () => ({
  randomBytes: (_size: number) => Buffer.from([0xde, 0xad, 0xbe, 0xef]),
}));

let tempFiles: Map<string, string> = new Map();
let tmuxAvailable = true;
let tmuxSessions: Set<string> = new Set();

describe("runReviewer", () => {
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  let mockSpawnProcs: MockProc[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.PI_CODING_AGENT_DIR = "/pi-agent";
    tmuxAvailable = true;
    tmuxSessions = new Set();
    tempFiles = new Map();
    mockSpawnProcs = [];

    vi.mocked(spawnSync).mockImplementation(mockSpawnSync);

    vi.mocked(spawn).mockImplementation(
      (cmd: string, args?: readonly string[], _options?: unknown) => {
        const proc = createMockProc();
        mockSpawnProcs.push(proc);

        if (cmd === "tmux" && args?.[0] === "new-session") {
          const name = args[3];
          tmuxSessions.add(name);
          setTimeout(() => {
            proc.emit("exit", 0);
          }, 10);
          setTimeout(() => {
            tmuxSessions.delete(name);
          }, 100);
        }

        return proc as never;
      },
    );

    vi.mocked(writeFileSync).mockImplementation((path: unknown, data: unknown) => {
      tempFiles.set(path as string, data as string);
    });

    vi.mocked(existsSync).mockImplementation((path: unknown) => tempFiles.has(String(path)));

    vi.mocked(readFileSync).mockImplementation((path: unknown) => {
      const content = tempFiles.get(String(path));
      if (content === undefined) throw new Error(`ENOENT: ${String(path)}`);
      return content;
    });

    vi.mocked(unlinkSync).mockImplementation((path: unknown) => {
      tempFiles.delete(String(path));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    if (originalAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    }
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

  it("spawns tmux with the submit_review tool extension", async () => {
    const promise = runReviewer({
      prompt: "review this",
      model: "openai/gpt-4o",
      cwd: "/tmp",
      target: { type: "custom", instructions: "review this" },
    });

    await vi.advanceTimersByTimeAsync(50);
    const spawnCall = vi.mocked(spawn).mock.calls[0];
    expect(spawnCall?.[0]).toBe("tmux");
    const spawnArgs = spawnCall?.[1] as string[];
    expect(spawnArgs).toContain("new-session");
    const toolPath = getToolPathFromSpawn();
    expect(toolPath).toMatch(/supi-review-.*-tool\.ts$/);
    expect(tempFiles.has(toolPath)).toBe(true);
    expect(tempFiles.get(toolPath)).toContain("submit_review");
    writeDefaultOutputFromSpawn();

    vi.advanceTimersByTime(1500);
    const result = await promise;
    expect(result.kind).toBe("success");
  });

  it("passes the review prompt content via --append-system-prompt", async () => {
    const promise = runReviewer({
      prompt: "review this",
      model: "openai/gpt-4o",
      cwd: "/tmp",
      target: { type: "custom", instructions: "review this" },
    });

    await vi.advanceTimersByTimeAsync(50);
    const piArgs = getPiArgsFromSpawn();
    const runnerScript = tempFiles.get(getRunnerPathFromSpawn()) ?? "";
    writeDefaultOutputFromSpawn();
    vi.advanceTimersByTime(1500);
    await promise;

    expect(piArgs).toContain("--append-system-prompt");
    expect(runnerScript).toContain("submit_review");
    expect(runnerScript).toContain("Do NOT output JSON directly");
    expect(runnerScript).not.toContain("review-prompt.md");
  });

  it("includes submit_review in the tool allowlist", async () => {
    const promise = runReviewer({
      prompt: "review this",
      model: "openai/gpt-4o",
      cwd: "/tmp",
      target: { type: "custom", instructions: "review this" },
    });

    await vi.advanceTimersByTimeAsync(50);
    const piArgs = getPiArgsFromSpawn();
    writeDefaultOutputFromSpawn();
    vi.advanceTimersByTime(1500);
    await promise;

    expect(piArgs).toContain("--tools");
    const toolsIndex = piArgs.indexOf("--tools");
    expect(piArgs[toolsIndex + 1]).toBe("read,grep,find,ls,submit_review");
  });

  it("omits --model when no model is resolved", async () => {
    const promise = runReviewer({
      prompt: "review this",
      model: undefined,
      cwd: "/tmp",
      target: { type: "custom", instructions: "review this" },
    });

    await vi.advanceTimersByTimeAsync(50);
    const piArgs = getPiArgsFromSpawn();
    writeDefaultOutputFromSpawn();
    vi.advanceTimersByTime(1500);
    await promise;

    expect(piArgs).not.toContain("--model");
  });

  it("reads valid JSON from the temp output file on success", async () => {
    const promise = runReviewer({
      prompt: "review this",
      model: "test-model",
      cwd: "/tmp",
      target: { type: "custom", instructions: "review this" },
    });

    await vi.advanceTimersByTimeAsync(50);
    const toolPath = getToolPathFromSpawn();
    const outputPath = toolPath.replace("-tool.ts", ".json");
    tempFiles.set(
      outputPath,
      JSON.stringify({
        findings: [
          {
            title: "Bug",
            body: "There is a bug",
            confidence_score: 0.9,
            priority: 2,
            code_location: { absolute_file_path: "/tmp/a.ts", line_range: { start: 5, end: 10 } },
          },
        ],
        overall_correctness: "patch is incorrect",
        overall_explanation: "Found issues",
        overall_confidence_score: 0.8,
      }),
    );

    vi.advanceTimersByTime(1500);
    const result = await promise;

    expect(result.kind).toBe("success");
    const successResult = result as Extract<typeof result, { kind: "success" }>;
    expect(successResult.output.findings).toHaveLength(1);
    expect(successResult.output.findings[0]?.title).toBe("Bug");
  });

  it("warns when the model never calls submit_review and falls back to pane capture", async () => {
    const paneOutput = `Some review text here.

{"findings":[],"overall_correctness":"patch is correct","overall_explanation":"Looks good","overall_confidence_score":0.95}

End.`;

    const promise = runReviewer({
      prompt: "review this",
      model: undefined,
      cwd: "/tmp",
      target: { type: "custom", instructions: "review this" },
    });

    await vi.advanceTimersByTimeAsync(50);
    const paneLogPath = getPaneLogPathFromSpawn();
    tempFiles.set(paneLogPath, paneOutput);

    vi.advanceTimersByTime(1500);
    const result = await promise;

    expect(result.kind).toBe("success");
    const successResult = result as Extract<typeof result, { kind: "success" }>;
    expect(successResult.warning).toContain("did not submit a structured result");
    expect(successResult.warning).toContain("Recovered a valid JSON object");
  });

  it("warns and falls back when the structured output file is malformed", async () => {
    const promise = runReviewer({
      prompt: "review this",
      model: undefined,
      cwd: "/tmp",
      target: { type: "custom", instructions: "review this" },
    });

    await vi.advanceTimersByTimeAsync(50);
    tempFiles.set(getToolPathFromSpawn().replace("-tool.ts", ".json"), '{"findings":[]}');
    tempFiles.set(
      getPaneLogPathFromSpawn(),
      '{"findings":[],"overall_correctness":"patch is correct","overall_explanation":"Recovered from log","overall_confidence_score":0.95}',
    );

    vi.advanceTimersByTime(1500);
    const result = await promise;

    expect(result.kind).toBe("success");
    const successResult = result as Extract<typeof result, { kind: "success" }>;
    expect(successResult.warning).toContain("submitted malformed JSON");
    expect(successResult.warning).toContain("Recovered a valid JSON object");
    expect(successResult.output.overall_explanation).toBe("Recovered from log");
  });

  it("recovers JSON from JSONL assistant output", async () => {
    const promise = runReviewer({
      prompt: "review this",
      model: undefined,
      cwd: "/tmp",
      target: { type: "custom", instructions: "review this" },
    });

    await vi.advanceTimersByTimeAsync(50);
    const paneLogPath = getPaneLogPathFromSpawn();
    tempFiles.set(paneLogPath, `${sessionHeader()}\n${assistantMessageEnd()}\n`);

    vi.advanceTimersByTime(1500);
    const result = await promise;

    expect(result.kind).toBe("success");
    const successResult = result as Extract<typeof result, { kind: "success" }>;
    expect(successResult.warning).toContain("Recovered a valid JSON object");
    expect(successResult.output.overall_explanation).toBe("x");
  });

  it("warns when fallback extraction finds no valid JSON", async () => {
    const promise = runReviewer({
      prompt: "review this",
      model: undefined,
      cwd: "/tmp",
      target: { type: "custom", instructions: "review this" },
    });

    await vi.advanceTimersByTimeAsync(50);
    const paneLogPath = getPaneLogPathFromSpawn();
    tempFiles.set(paneLogPath, "This is just some plain text review.");

    vi.advanceTimersByTime(1500);
    const result = await promise;

    expect(result.kind).toBe("success");
    const successResult = result as Extract<typeof result, { kind: "success" }>;
    expect(successResult.warning).toContain("did not submit a structured result");
    expect(successResult.warning).toContain("shown as plain text");
    expect(successResult.output.overall_explanation).toBe("This is just some plain text review.");
  });

  it("announces the tmux session only after startup succeeds", async () => {
    const onSessionStart = vi.fn();
    const promise = runReviewer({
      prompt: "review",
      model: undefined,
      cwd: "/tmp",
      target: { type: "custom", instructions: "review" },
      onSessionStart,
    });

    expect(onSessionStart).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    expect(onSessionStart).toHaveBeenCalledTimes(1);
    expect(onSessionStart).toHaveBeenCalledWith(getSessionNameFromSpawn());
    writeDefaultOutputFromSpawn();
    vi.advanceTimersByTime(1500);
    await promise;
  });

  it("handles abort signal", async () => {
    vi.useRealTimers();
    const controller = new AbortController();
    const promise = runReviewer({
      prompt: "review",
      model: undefined,
      cwd: "/tmp",
      signal: controller.signal,
      target: { type: "custom", instructions: "review" },
    });

    controller.abort();
    const result = await promise;

    expect(result.kind).toBe("canceled");
    vi.useFakeTimers();
  });

  it("fails clearly when tmux is unavailable", async () => {
    tmuxAvailable = false;

    const result = await runReviewer({
      prompt: "review",
      model: undefined,
      cwd: "/tmp",
      target: { type: "custom", instructions: "review" },
    });

    expect(result.kind).toBe("failed");
    expect((result as Extract<typeof result, { kind: "failed" }>).reason).toContain(
      "tmux is required",
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("handles tmux spawn errors gracefully", async () => {
    const mockProc = createMockProc();
    vi.mocked(spawn).mockImplementation(
      (cmd: string, _args?: readonly string[], _options?: unknown) => {
        if (cmd === "tmux") {
          const proc = createMockProc();
          mockSpawnProcs.push(proc);
          setTimeout(() => {
            proc.emit("error", new Error("ENOENT"));
          }, 10);
          return proc as never;
        }
        return mockProc as never;
      },
    );

    const promise = runReviewer({
      prompt: "review",
      model: undefined,
      cwd: "/tmp",
      target: { type: "custom", instructions: "review" },
    });

    vi.advanceTimersByTime(100);
    const result = await promise;

    expect(result.kind).toBe("failed");
    expect((result as Extract<typeof result, { kind: "failed" }>).reason).toContain("spawn");
  });

  it("resolves tmux session name collisions", async () => {
    // Pre-register the first session name so collision handling kicks in
    const promise = runReviewer({
      prompt: "review",
      model: undefined,
      cwd: "/tmp",
      target: { type: "custom", instructions: "review" },
    });

    const firstSessionName = getSessionNameFromSpawn();
    tmuxSessions.add(firstSessionName);

    // Start a second review
    const promise2 = runReviewer({
      prompt: "review2",
      model: undefined,
      cwd: "/tmp",
      target: { type: "custom", instructions: "review2" },
    });

    const secondSessionName = getSessionNameFromSpawn(1);

    // Clean up
    tmuxSessions.delete(firstSessionName);
    vi.advanceTimersByTime(1500);
    await promise;
    await promise2;

    expect(secondSessionName).not.toBe(firstSessionName);
    expect(secondSessionName).toMatch(/^supi-review-.*-1$/);
  });
});

function mockSpawnSync(cmd: string, args?: readonly string[]): never {
  if (cmd !== "tmux") return syncResult();
  return handleTmuxCommand(args ?? []);
}

function handleTmuxCommand(args: readonly string[]): never {
  const handlers: Record<string, (args: readonly string[]) => never> = {
    "-V": tmuxVersionResult,
    "has-session": tmuxHasSessionResult,
    "send-keys": () => syncResult(),
    "kill-session": tmuxKillSessionResult,
  };
  return (handlers[args[0] ?? ""] ?? (() => syncResult()))(args);
}

function tmuxVersionResult(): never {
  return syncResult(
    tmuxAvailable ? 0 : 1,
    "tmux 3.4",
    tmuxAvailable ? undefined : new Error("not found"),
  );
}

function tmuxHasSessionResult(args: readonly string[]): never {
  return syncResult(tmuxSessions.has(args[2] ?? "") ? 0 : 1);
}

function tmuxKillSessionResult(args: readonly string[]): never {
  tmuxSessions.delete(args[2] ?? "");
  return syncResult();
}

function syncResult(status = 0, stdout = "", error?: Error): never {
  return { status, error, stdout, stderr: "" } as never;
}

function getToolPathFromSpawn(index = 0): string {
  const piArgs = getPiArgsFromSpawn(index);
  const eIndex = piArgs.indexOf("-e");
  return piArgs[eIndex + 1] as string;
}

function getPiArgsFromSpawn(index = 0): string[] {
  const runnerPath = getRunnerPathFromSpawn(index);
  const script = tempFiles.get(runnerPath);
  const match = script?.match(/^const args = (.*);$/m);
  if (!match?.[1]) throw new Error("runner args were not written");
  return JSON.parse(match[1]) as string[];
}

function getRunnerPathFromSpawn(index = 0): string {
  const call = vi.mocked(spawn).mock.calls[index];
  const args = call?.[1] as string[];
  return args.at(-1) as string;
}

function getPaneLogPathFromSpawn(index = 0): string {
  return getToolPathFromSpawn(index).replace("-tool.ts", "-pane.log");
}

function writeDefaultOutputFromSpawn(index = 0): void {
  tempFiles.set(getToolPathFromSpawn(index).replace("-tool.ts", ".json"), defaultReviewJson());
}

function getSessionNameFromSpawn(index = 0): string {
  const call = vi.mocked(spawn).mock.calls[index];
  const args = call?.[1] as string[];
  const sIndex = args.indexOf("-s");
  return args[sIndex + 1] as string;
}

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

function sessionHeader(): string {
  return JSON.stringify({
    type: "session",
    id: "review-session-id",
    timestamp: "2026-04-27T17:00:00.000Z",
    cwd: "/tmp",
  });
}

interface MockProc {
  on: (event: string, fn: (...args: unknown[]) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;
  stdout?: {
    setEncoding: () => void;
    on: (event: string, fn: (arg?: unknown) => void) => void;
    emit: (event: string, arg?: unknown) => void;
  };
  stderr?: {
    setEncoding: () => void;
    on: (event: string, fn: (arg?: unknown) => void) => void;
    emit: (event: string, arg?: unknown) => void;
  };
  kill: ReturnType<typeof vi.fn>;
  killed: boolean;
}

function createMockProc(): MockProc {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const stdoutListeners: Record<string, Array<(arg?: unknown) => void>> = {};
  const stderrListeners: Record<string, Array<(arg?: unknown) => void>> = {};

  const on = (event: string, fn: (...args: unknown[]) => void) => {
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
