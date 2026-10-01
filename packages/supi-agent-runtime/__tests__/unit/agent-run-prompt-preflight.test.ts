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

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe("Agent Run prompt preflight", () => {
  it("rejects a late started callback after the prompt resolves without a disposition", async () => {
    const harness = createHarness(mocks);
    let startDeferredPrompt!: () => void;
    const startWork = vi.fn();
    harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
      startDeferredPrompt = () => {
        options?.preflightResult?.("started");
        startWork();
      };
    });
    const completionResolver = vi.fn(() => "unreachable");
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "deferred prompt",
      completionResolver,
    });

    await expect(run.result).resolves.toMatchObject({
      kind: "failed",
      failureCode: "prompt-rejected",
    });
    expect(harness.runtime.dispose).toHaveBeenCalledOnce();
    expect(() => startDeferredPrompt()).toThrow();
    expect(startWork).not.toHaveBeenCalled();
    expect(completionResolver).not.toHaveBeenCalled();
  });

  it("rejects a late started callback after cancellation", async () => {
    const harness = createHarness(mocks);
    let releaseIdle!: () => void;
    const idle = new Promise<undefined>((resolve) => {
      releaseIdle = () => resolve(undefined);
    });
    harness.session.agent.waitForIdle.mockImplementation(() => idle);
    let startDeferredPrompt!: () => void;
    const startWork = vi.fn();
    harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
      startDeferredPrompt = () => {
        options?.preflightResult?.("started");
        startWork();
      };
    });
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "deferred prompt",
      completionResolver: () => "unreachable",
    });

    await vi.waitFor(() => expect(harness.session.agent.waitForIdle).toHaveBeenCalled());
    const stopped = run.stop();
    try {
      expect(() => startDeferredPrompt()).toThrow();
      expect(startWork).not.toHaveBeenCalled();
    } finally {
      releaseIdle();
    }

    await stopped;
    await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
  });

  it("rejects a late continuation start while the next turn is pending", async () => {
    const harness = createHarness(mocks);
    harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
      options?.preflightResult?.("started");
      harness.session.emit({ type: "agent_settled" });
    });
    let startDeferredPrompt!: () => void;
    const startWork = vi.fn();
    harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
      startDeferredPrompt = () => {
        options?.preflightResult?.("started");
        startWork();
      };
    });
    let selectSecondTurn!: () => void;
    const secondTurnSelected = new Promise<void>((resolve) => {
      selectSecondTurn = resolve;
    });
    let releaseSecondTurn!: () => void;
    const secondTurnGate = new Promise<void>((resolve) => {
      releaseSecondTurn = resolve;
    });
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "initial prompt",
      completionResolver: () => undefined,
      continuation: {
        maxTurns: 2,
        resolveNext: async ({ nextTurn }) => {
          if (nextTurn === 1) {
            return {
              prompt: "first continuation",
              activeTools: ["read"],
              thinkingLevel: "low",
            };
          }
          selectSecondTurn();
          await secondTurnGate;
          return undefined;
        },
      },
    });

    await secondTurnSelected;
    expect(harness.session.prompt).toHaveBeenCalledTimes(2);
    try {
      expect(() => startDeferredPrompt()).toThrow();
      expect(startWork).not.toHaveBeenCalled();
    } finally {
      releaseSecondTurn();
    }

    await expect(run.result).resolves.toMatchObject({
      kind: "failed",
      failureCode: "missing-completion",
    });
  });
});
