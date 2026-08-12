import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  createAgentSessionRuntime: vi.fn(),
  createModelRuntime: vi.fn(async () => ({
    getProviders: vi.fn(() => []),
    registerNativeProvider: vi.fn(),
    refresh: vi.fn(async () => undefined),
  })),
}));

vi.mock("@earendil-works/pi-coding-agent", async (original) => ({
  ...(await original()),
  ModelRuntime: { create: mocks.createModelRuntime },
  createAgentSession: mocks.createAgentSession,
  createAgentSessionRuntime: mocks.createAgentSessionRuntime,
}));

import { startAgentRun } from "../../src/api.ts";
import { createHarness, inputs } from "../helpers/agent-run-harness.ts";

const recoveryModel = {
  provider: "recovery-provider",
  id: "recovery-model",
  name: "Recovery Model",
  api: "openai-completions" as const,
  baseUrl: "https://recovery.example",
  reasoning: true,
  input: ["text"] as ("text" | "image")[],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 10_000,
  maxTokens: 1_000,
};

const usage = (value: number) => ({
  input: value,
  output: value,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: value * 2,
  cost: {
    input: value,
    output: value,
    cacheRead: 0,
    cacheWrite: 0,
    total: value * 2,
  },
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe("Agent Run finite continuation", () => {
  it("continues an accepted missing completion in the same session and disposes once", async () => {
    const harness = createHarness(mocks);
    let completion: string | undefined;
    const resolveNext = vi.fn(({ nextTurn }) => {
      if (nextTurn > 1) return undefined;
      completion = "recovered";
      return {
        prompt: "Submit or decline from retained history.",
        activeTools: ["submit_review", "decline_review_recovery"],
        thinkingLevel: "low" as const,
      };
    });
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "review",
      completionResolver: () => completion,
      continuation: { maxTurns: 1, resolveNext },
    });

    await expect(run.result).resolves.toMatchObject({ kind: "success", value: "recovered" });
    expect(resolveNext).toHaveBeenCalledOnce();
    expect(harness.session.prompt).toHaveBeenCalledTimes(2);
    expect(harness.session.setActiveToolsByName).toHaveBeenCalledWith([
      "submit_review",
      "decline_review_recovery",
    ]);
    expect(harness.session.setThinkingLevel).toHaveBeenCalledWith("low");
    expect(harness.runtime.dispose).toHaveBeenCalledTimes(1);
  });

  it("continues an accepted provider error that resolves through PI", async () => {
    const harness = createHarness(mocks);
    harness.session.messages = [
      {
        role: "assistant",
        content: [],
        stopReason: "error",
        errorMessage: "quota exhausted",
      },
    ];
    const resolveNext = vi.fn(async () => undefined);
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "review",
      completionResolver: () => undefined,
      continuation: { maxTurns: 1, resolveNext },
    });

    await expect(run.result).resolves.toMatchObject({
      kind: "failed",
      failureCode: "unexpected-runner-failure",
    });
    expect(resolveNext).toHaveBeenCalledWith(
      expect.objectContaining({ initialFailureCode: "unexpected-runner-failure" }),
    );
  });

  it("lets continuation retain the original accepted provider failure", async () => {
    const harness = createHarness(mocks);
    harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
      options?.preflightResult?.(true);
      throw new Error("private provider failure");
    });
    const resolveNext = vi.fn(async () => undefined);
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "review",
      completionResolver: () => undefined,
      continuation: { maxTurns: 1, resolveNext },
    });

    await expect(run.result).resolves.toMatchObject({
      kind: "failed",
      failureCode: "unexpected-runner-failure",
    });
    expect(resolveNext).toHaveBeenCalledWith(
      expect.objectContaining({
        initialFailureCode: "unexpected-runner-failure",
        nextTurn: 1,
        session: expect.anything(),
      }),
    );
    expect(harness.runtime.dispose).toHaveBeenCalledTimes(1);
  });

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the table covers all ineligible lifecycle outcomes through one seam.
  it("does not continue after preflight rejection, cancellation, timeout, or an unready session", async () => {
    const cases = ["rejected", "canceled", "timeout", "unready"] as const;
    for (const kind of cases) {
      vi.clearAllMocks();
      vi.useRealTimers();
      const harness = createHarness(mocks);
      const resolveNext = vi.fn();
      if (kind === "rejected") {
        harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
          options?.preflightResult?.(false);
        });
      }
      if (kind === "canceled") {
        harness.session.prompt.mockImplementationOnce(
          async (_prompt, options) =>
            new Promise<void>(() => {
              options?.preflightResult?.(true);
            }),
        );
      }
      if (kind === "timeout") {
        vi.useFakeTimers();
        harness.session.prompt.mockImplementationOnce(
          async (_prompt, options) =>
            new Promise<void>(() => {
              options?.preflightResult?.(true);
            }),
        );
      }
      const run = startAgentRun({
        inputs: inputs(),
        prompt: "review",
        completionResolver: () => undefined,
        continuation: { maxTurns: 1, resolveNext },
        ...(kind === "unready" ? { readinessCheck: () => false } : {}),
        ...(kind === "timeout" ? { timeoutMs: 1 } : {}),
      });
      if (kind === "canceled") {
        await vi.waitFor(() => expect(harness.session.prompt).toHaveBeenCalled());
        await run.stop();
      }
      if (kind === "timeout") await vi.advanceTimersByTimeAsync(1);
      await run.result;
      expect(resolveNext).not.toHaveBeenCalled();
    }
  });

  it("switches to an authorized cross-provider continuation model", async () => {
    const harness = createHarness(mocks);
    let completion: string | undefined;
    harness.session.setModel.mockImplementationOnce(async () => {
      harness.session.model = recoveryModel;
    });
    const run = startAgentRun({
      inputs: {
        ...inputs(),
        authorizedContinuationModels: [recoveryModel as never],
        providerAuthority: {
          getProvider: (providerId) => {
            const model =
              providerId === recoveryModel.provider
                ? recoveryModel
                : (inputs().model as typeof recoveryModel);
            return {
              id: providerId,
              name: providerId,
              auth: {
                apiKey: {
                  name: `${providerId} key`,
                  resolve: async () => ({ auth: { apiKey: "test-key" } }),
                },
              },
              getModels: () => [model],
              stream: vi.fn(),
              streamSimple: vi.fn(),
            };
          },
          getProviderAuth: async () => ({ auth: { apiKey: "test-key" } }),
        },
      },
      prompt: "review",
      completionResolver: () => completion,
      continuation: {
        maxTurns: 1,
        resolveNext: () => {
          completion = "recovered";
          return {
            prompt: "recover",
            activeTools: ["submit_review", "decline_review_recovery"],
            thinkingLevel: "low",
            model: { modelId: "recovery-provider/recovery-model", value: recoveryModel as never },
          };
        },
      },
    });

    await expect(run.result).resolves.toMatchObject({ kind: "success", value: "recovered" });
    expect(harness.session.setModel).toHaveBeenCalledWith(recoveryModel);
  });

  it("does not start a continuation step selected after cancellation", async () => {
    const harness = createHarness(mocks);
    let releaseStep!: () => void;
    const stepReady = new Promise<void>((resolve) => {
      releaseStep = resolve;
    });
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "review",
      completionResolver: () => undefined,
      continuation: {
        maxTurns: 1,
        resolveNext: async () => {
          await stepReady;
          return {
            prompt: "must not run",
            activeTools: ["submit_review", "decline_review_recovery"],
            thinkingLevel: "low",
          };
        },
      },
    });
    await vi.waitFor(() => expect(harness.session.prompt).toHaveBeenCalledOnce());
    const stopped = run.stop();
    releaseStep();

    await stopped;
    await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
    expect(harness.session.prompt).toHaveBeenCalledOnce();
    expect(harness.session.setActiveToolsByName).not.toHaveBeenCalled();
  });

  it("does not switch models when a turn-start observer stops the run", async () => {
    const harness = createHarness(mocks);
    let run: ReturnType<typeof startAgentRun<undefined>>;
    run = startAgentRun({
      inputs: {
        ...inputs(),
        authorizedContinuationModels: [recoveryModel as never],
        providerAuthority: {
          getProvider: (providerId) => ({
            id: providerId,
            name: providerId,
            auth: {
              apiKey: {
                name: "key",
                resolve: async () => ({ auth: { apiKey: "test-key" } }),
              },
            },
            getModels: () => [inputs().model as never, recoveryModel as never],
            stream: vi.fn(),
            streamSimple: vi.fn(),
          }),
          getProviderAuth: async () => ({ auth: { apiKey: "test-key" } }),
        },
      },
      prompt: "review",
      completionResolver: () => undefined,
      continuation: {
        maxTurns: 1,
        resolveNext: () => ({
          prompt: "must not run",
          activeTools: ["submit_review", "decline_review_recovery"],
          thinkingLevel: "low",
          model: {
            modelId: `${recoveryModel.provider}/${recoveryModel.id}`,
            value: recoveryModel as never,
          },
        }),
        onEvent: (event) => {
          if (event.type === "turn-start") void run.stop();
        },
      },
    });

    await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
    expect(harness.session.setModel).not.toHaveBeenCalled();
    expect(harness.session.prompt).toHaveBeenCalledOnce();
  });

  it("fails closed for a non-finite continuation bound", async () => {
    const harness = createHarness(mocks);
    const resolveNext = vi.fn(() => ({
      prompt: "must not run",
      activeTools: ["submit_review", "decline_review_recovery"],
      thinkingLevel: "low" as const,
    }));
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "review",
      completionResolver: () => undefined,
      continuation: { maxTurns: Number.POSITIVE_INFINITY, resolveNext },
    });

    await expect(run.result).resolves.toMatchObject({
      kind: "failed",
      failureCode: "missing-completion",
    });
    expect(resolveNext).not.toHaveBeenCalled();
    expect(harness.session.prompt).toHaveBeenCalledOnce();
  });

  it("reports non-negative per-turn usage delta without duplicating total usage", async () => {
    const entries = [{ type: "message", message: { role: "assistant", usage: usage(2) } }];
    const harness = createHarness(mocks, entries);
    harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
      options?.preflightResult?.(true);
    });
    harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
      options?.preflightResult?.(true);
      entries.push({ type: "message", message: { role: "assistant", usage: usage(3) } });
    });
    let completion: string | undefined;
    const onTurn = vi.fn();
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "review",
      completionResolver: () => completion,
      continuation: {
        maxTurns: 1,
        resolveNext: () => {
          completion = "recovered";
          return {
            prompt: "recover",
            activeTools: ["submit_review", "decline_review_recovery"],
            thinkingLevel: "low",
          };
        },
        onTurn,
      },
    });

    await expect(run.result).resolves.toMatchObject({
      kind: "success",
      usage: { input: 5 },
    });
    expect(onTurn).toHaveBeenCalledWith(
      expect.objectContaining({ usage: expect.objectContaining({ input: 3 }) }),
    );
  });

  it("does not block the original prompt when an authorized continuation provider is unavailable", async () => {
    const harness = createHarness(mocks);
    const original = inputs();
    const run = startAgentRun({
      inputs: {
        ...original,
        authorizedContinuationModels: [recoveryModel as never],
        providerAuthority: {
          ...original.providerAuthority,
          getProvider: (providerId) =>
            providerId === recoveryModel.provider
              ? undefined
              : original.providerAuthority.getProvider(providerId),
        },
      },
      prompt: "review",
      completionResolver: () => "done",
    });

    await expect(run.result).resolves.toMatchObject({ kind: "success", value: "done" });
    expect(harness.session.prompt).toHaveBeenCalledOnce();
  });

  it("fails closed when continuation requests an unauthorized model", async () => {
    const harness = createHarness(mocks);
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "review",
      completionResolver: () => undefined,
      continuation: {
        maxTurns: 1,
        resolveNext: () => ({
          prompt: "recover",
          activeTools: ["submit_review", "decline_review_recovery"],
          thinkingLevel: "low",
          model: { modelId: "recovery-provider/recovery-model", value: recoveryModel as never },
        }),
      },
    });

    await expect(run.result).resolves.toMatchObject({
      kind: "failed",
      failureCode: "missing-completion",
    });
    expect(harness.session.setModel).not.toHaveBeenCalled();
  });
});
