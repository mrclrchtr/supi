import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createResources: vi.fn(),
  startAgentRun: vi.fn(),
  startRegisteredAgentRun: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-agent-runtime/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@mrclrchtr/supi-agent-runtime/api")>()),
  startAgentRun: mocks.startAgentRun,
  startRegisteredAgentRun: mocks.startRegisteredAgentRun,
}));
vi.mock("../../src/tool/review_run/child-resources.ts", () => ({
  createIsolatedChildResources: mocks.createResources,
}));

import { AgentRunRegistry, type AgentRunSessionView } from "@mrclrchtr/supi-agent-runtime/api";
import { runIsolatedChild } from "../../src/tool/review_run/child-session.ts";

const diagnostics = { lifecycleTrace: { entries: [], droppedCount: 0 }, turns: 1, toolUses: 1 };
let registry: AgentRunRegistry;
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
    steeringAvailable: false,
    result: Promise.resolve(outcome),
    subscribe: vi.fn((listener: (progress: unknown) => void) => {
      for (const snapshot of progress) listener(snapshot);
      return vi.fn();
    }),
    steer: vi.fn(async () => "not-running" as const),
    stop: vi.fn(async () => undefined),
  };
}

describe("runIsolatedChild", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registry = new AgentRunRegistry();
    mocks.createResources.mockReturnValue({ loader: {}, settingsManager: {} });
  });

  afterEach(async () => {
    await registry.clear();
  });

  it("returns before resource allocation when provider authority is unavailable", async () => {
    await expect(runIsolatedChild({ ...config, providerAuthority: undefined })).resolves.toEqual({
      kind: "failed",
      failureCode: "session-creation-failed",
    });

    expect(mocks.createResources).not.toHaveBeenCalled();
    expect(mocks.startAgentRun).not.toHaveBeenCalled();
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
        {
          status: "running",
          turns: 1,
          toolUses: 0,
          toolErrors: 1,
          usage: {
            input: 10,
            output: 5,
            totalTokens: 15,
            cacheRead: 2,
            cacheWrite: 0,
            reasoning: 3,
          },
        },
        { status: "stopping", turns: 1, toolUses: 0, toolErrors: 1 },
        { status: "completed", turns: 1, toolUses: 0, toolErrors: 1 },
      ]),
    );

    await runIsolatedChild({ ...config, onProgress });

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      turns: 1,
      toolUses: 0,
      toolErrors: 1,
      tokens: { input: 10, output: 5, total: 15, cacheRead: 2, cacheWrite: 0, reasoning: 3 },
    });
    const resourceAgentDir = mocks.createResources.mock.calls[0]?.[2];
    const runtimeAgentDir = mocks.startAgentRun.mock.calls[0]?.[0].inputs.agentDir;
    expect(runtimeAgentDir).toBe(resourceAgentDir);
  });

  it("keeps Review observer cleanup in a registered child", async () => {
    const unsubscribeAudit = vi.fn();
    const session = {
      systemPrompt: "Reviewer Protocol",
      getToolRenderers: () => [],
      subscribe: (listener: (event: never) => void) => {
        listener({
          type: "message_end",
          message: { role: "assistant", content: [{ type: "text", text: "Review finished." }] },
        } as never);
        return vi.fn();
      },
    } as unknown as AgentRunSessionView;
    mocks.startRegisteredAgentRun.mockImplementation(
      (options: {
        observer?: (view: AgentRunSessionView) => unknown;
        registration: { metadata: { runKey: string } };
      }) => ({
        ...handle({ kind: "success", value: "submitted" }),
        runKey: options.registration.metadata.runKey,
        result: Promise.resolve().then(async () => {
          const cleanup = await options.observer?.(session);
          if (typeof cleanup === "function") cleanup();
          return { kind: "success", value: "submitted" };
        }),
      }),
    );
    const runDisplay = {
      runKey: "review-run",
      batchId: "review-batch",
      taskId: "task-1",
      kind: "Reviewer",
      label: "change review",
      cwd: "/repo",
      modelId: "test/model",
      thinkingLevel: "low",
      tools: ["read", "submit_review"],
      startedAt: 1,
    } as const;

    await expect(
      runIsolatedChild({
        ...config,
        registry,
        runDisplay,
        displayResult: () => ({ finalText: "Review finished." }),
        onSessionCreated: () => unsubscribeAudit,
      }),
    ).resolves.toMatchObject({ kind: "success", value: "submitted" });

    expect(unsubscribeAudit).toHaveBeenCalledOnce();
    expect(mocks.startRegisteredAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        registration: {
          metadata: runDisplay,
        },
        transcriptSystemPrompt: "protocol",
      }),
    );
  });

  it("omits reasoning when the provider does not report it", async () => {
    const onProgress = vi.fn();
    mocks.startAgentRun.mockReturnValue(
      handle({ kind: "success", value: "done" }, [
        {
          status: "running",
          turns: 1,
          toolUses: 0,
          toolErrors: 0,
          usage: { input: 10, output: 5, totalTokens: 15, cacheRead: 2, cacheWrite: 0 },
        },
      ]),
    );

    await runIsolatedChild({ ...config, onProgress });

    expect(onProgress).toHaveBeenCalledWith({
      turns: 1,
      toolUses: 0,
      toolErrors: 0,
      tokens: { input: 10, output: 5, total: 15, cacheRead: 2, cacheWrite: 0 },
    });
  });
});
