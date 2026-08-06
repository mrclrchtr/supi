import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createResources: vi.fn(),
  startAgentRun: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-agent-runtime/api", () => ({
  startAgentRun: mocks.startAgentRun,
}));
vi.mock("../../src/tool/child-resource-loader.ts", () => ({
  createIsolatedChildResources: mocks.createResources,
}));

import { runIsolatedChild } from "../../src/tool/child-session-runner.ts";

const diagnostics = { lifecycleTrace: { entries: [], droppedCount: 0 }, turns: 1, toolUses: 1 };
const config = {
  cwd: "/repo",
  providerAuthority: {
    getProvider: () => undefined,
    getProviderAuth: async () => undefined,
  },
  protocolPrompt: "protocol",
  model: {} as never,
  thinkingLevel: "low" as never,
  prompt: "packet",
  tools: ["read"],
  customTools: [],
  holder: {} as { value?: string },
};

function handle(outcome: unknown, progress: unknown[] = []) {
  return {
    result: Promise.resolve(outcome),
    subscribe: vi.fn((listener: (progress: unknown) => void) => {
      for (const snapshot of progress) listener(snapshot);
      return vi.fn();
    }),
  };
}

describe("runIsolatedChild", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createResources.mockReturnValue({ loader: {}, settingsManager: {} });
  });

  it("maps every runtime failure branch to review vocabulary", async () => {
    const cases = [
      [
        { kind: "success", value: "done" },
        { kind: "success", value: "done" },
      ],
      [
        { kind: "failed", failureCode: "session-creation-failed" },
        { kind: "failed", failureCode: "session-creation-failed" },
      ],
      [
        { kind: "failed", failureCode: "session-not-ready", diagnostics },
        { kind: "failed", failureCode: "session-creation-failed" },
      ],
      [
        { kind: "failed", failureCode: "missing-completion", diagnostics },
        { kind: "failed", failureCode: "missing-structured-output", diagnostics },
      ],
      [
        { kind: "failed", failureCode: "prompt-rejected", diagnostics },
        { kind: "failed", failureCode: "prompt-rejected", diagnostics },
      ],
      [
        { kind: "failed", failureCode: "unexpected-runner-failure", diagnostics },
        { kind: "failed", failureCode: "unexpected-runner-failure", diagnostics },
      ],
      [
        { kind: "canceled", diagnostics },
        { kind: "canceled", diagnostics },
      ],
      [
        { kind: "timeout", timeoutMs: 10, diagnostics },
        { kind: "timeout", timeoutMs: 10, diagnostics },
      ],
    ] as const;

    for (const [runtimeOutcome, reviewOutcome] of cases) {
      mocks.startAgentRun.mockReturnValueOnce(handle(runtimeOutcome));
      await expect(runIsolatedChild(config)).resolves.toEqual(reviewOutcome);
    }
  });

  it("forwards only active work progress and shares one concrete agent directory", async () => {
    const onProgress = vi.fn();
    mocks.startAgentRun.mockReturnValue(
      handle({ kind: "success", value: "done" }, [
        { status: "starting", turns: 0, toolUses: 0, toolErrors: 0 },
        { status: "running", turns: 0, toolUses: 0, toolErrors: 0 },
        { status: "running", turns: 1, toolUses: 0, toolErrors: 1 },
        { status: "stopping", turns: 1, toolUses: 0, toolErrors: 1 },
        { status: "completed", turns: 1, toolUses: 0, toolErrors: 1 },
      ]),
    );

    await runIsolatedChild({ ...config, onProgress });

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({ turns: 1, toolUses: 0, toolErrors: 1 });
    const resourceAgentDir = mocks.createResources.mock.calls[0]?.[2];
    const runtimeAgentDir = mocks.startAgentRun.mock.calls[0]?.[0].inputs.agentDir;
    expect(runtimeAgentDir).toBe(resourceAgentDir);
  });
});
