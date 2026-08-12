import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runIsolatedChild: vi.fn(),
}));

vi.mock("../../src/tool/child-session-runner.ts", () => ({
  runIsolatedChild: mocks.runIsolatedChild,
}));

import type { AgentRunSessionView } from "@mrclrchtr/supi-agent-runtime/api";
import { ReviewAuditTraceCollector } from "../../src/audit/review-audit.ts";
import { redactDeclineSecrets } from "../../src/tool/review-recovery.ts";
import { runReviewer } from "../../src/tool/review-runner.ts";
import type { ReviewModelSelection, ReviewSnapshot } from "../../src/types.ts";

const snapshot: ReviewSnapshot = {
  repositoryRoot: "/repo",
  requestedTarget: {},
  target: { fromCommit: "a".repeat(40), toCommit: "a".repeat(40), includeUncommittedChanges: true },
  title: "Filesystem changes",
  changes: [{ status: "M", path: "a.ts", additions: 1, deletions: 0 }],
  diffHash: "b".repeat(64),
  stats: { files: 1, additions: 1, deletions: 0 },
};
const originalModel = {
  canonicalId: "provider/original",
  provider: "provider",
  id: "original",
  model: { provider: "provider", id: "original", reasoning: true },
} as ReviewModelSelection;
const recoveryModel = {
  canonicalId: "other/recovery",
  provider: "other",
  id: "recovery",
  model: { provider: "other", id: "recovery", reasoning: true },
} as ReviewModelSelection;
const diagnostics = { lifecycleTrace: { entries: [], droppedCount: 0 }, turns: 2, toolUses: 1 };
const invocation = {
  cwd: "/repo",
  snapshot,
  task: { id: "spec", instructions: "Review.", mode: "change" as const },
  prompt: "exact packet bytes",
  packetHash: "c".repeat(64),
  model: originalModel,
};

function view(messages: unknown[]): AgentRunSessionView {
  return {
    cwd: "/repo",
    model: originalModel.model as never,
    thinkingLevel: "max",
    isStreaming: false,
    messages: messages as never,
    getActiveToolNames: () => ["read", "submit_review"],
    getSessionStats: () => ({ tokens: { input: 0, output: 0, total: 0 } }) as never,
    getLastAssistantText: () => undefined,
    subscribe: vi.fn(() => vi.fn()),
  };
}

describe("Reviewer Submission Recovery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recovers a clean missing submission on the original model with only terminal tools", async () => {
    mocks.runIsolatedChild.mockImplementation(async (config) => {
      config.onSessionCreated?.(
        view([{ role: "assistant", content: [{ type: "text", text: "inspection complete" }] }]),
      );
      const step = await config.continuation.resolveNext({
        session: view([{ role: "assistant", content: [] }]),
        initialFailureCode: "missing-completion",
        nextTurn: 1,
      });
      expect(step).toMatchObject({
        activeTools: ["submit_review", "decline_review_recovery"],
        thinkingLevel: "low",
      });
      expect(step.model).toBeUndefined();
      expect(step.prompt.toLowerCase()).toContain("inspection is complete");
      config.holder.value = {
        summary: "Recovered",
        findings: [],
        criteriaCoverage: { status: "complete" },
      };
      config.declineHolder.choice = "submitted";
      config.continuation.onTurn({
        turn: 1,
        modelId: originalModel.canonicalId,
        outcome: "settled",
        promptAccepted: true,
      });
      return { kind: "success", value: config.holder.value };
    });

    await expect(runReviewer(invocation)).resolves.toMatchObject({
      kind: "success",
      modelId: originalModel.canonicalId,
      submissionRecovery: {
        status: "succeeded",
        attempts: [{ modelId: originalModel.canonicalId, outcome: "submitted" }],
      },
    });
    expect(mocks.runIsolatedChild.mock.calls[0]?.[0].initialActiveTools).not.toContain(
      "decline_review_recovery",
    );
  });

  it("uses an explicit cross-provider model once after the original recovery turn", async () => {
    mocks.runIsolatedChild.mockImplementation(async (config) => {
      config.onSessionCreated?.(view([{ role: "toolResult", toolName: "read", content: [] }]));
      const first = await config.continuation.resolveNext({
        session: view([{ role: "toolResult", toolName: "read", content: [] }]),
        initialFailureCode: "unexpected-runner-failure",
        nextTurn: 1,
      });
      expect(first.model).toBeUndefined();
      config.continuation.onTurn({
        turn: 1,
        modelId: originalModel.canonicalId,
        outcome: "provider-failed",
        promptAccepted: true,
      });
      const second = await config.continuation.resolveNext({
        session: view([{ role: "toolResult", toolName: "read", content: [] }]),
        initialFailureCode: "unexpected-runner-failure",
        nextTurn: 2,
        previousTurn: {
          turn: 1,
          modelId: originalModel.canonicalId,
          outcome: "provider-failed",
          promptAccepted: true,
        },
      });
      expect(second.model).toEqual({
        modelId: recoveryModel.canonicalId,
        value: recoveryModel.model,
      });
      config.holder.value = {
        summary: "Recovered",
        findings: [],
        criteriaCoverage: { status: "complete" },
      };
      config.declineHolder.choice = "submitted";
      config.continuation.onTurn({
        turn: 2,
        modelId: recoveryModel.canonicalId,
        outcome: "settled",
        promptAccepted: true,
      });
      return { kind: "success", value: config.holder.value, usage: usage(5) };
    });

    await expect(runReviewer({ ...invocation, recoveryModel })).resolves.toMatchObject({
      kind: "success",
      modelId: originalModel.canonicalId,
      submissionRecovery: {
        status: "succeeded",
        attempts: [
          { modelId: originalModel.canonicalId, outcome: "provider-failed" },
          { modelId: recoveryModel.canonicalId, outcome: "submitted" },
        ],
      },
    });
    expect(mocks.runIsolatedChild.mock.calls[0]?.[0].authorizedContinuationModels).toEqual([
      recoveryModel.model,
    ]);
  });

  it("does not give the original model a second recovery turn", async () => {
    mocks.runIsolatedChild.mockImplementation(async (config) => {
      const retained = view([{ role: "assistant", content: [] }]);
      await config.continuation.resolveNext({
        session: retained,
        initialFailureCode: "missing-completion",
        nextTurn: 1,
      });
      const next = await config.continuation.resolveNext({
        session: retained,
        initialFailureCode: "missing-completion",
        nextTurn: 2,
      });
      expect(next).toBeUndefined();
      config.continuation.onTurn({
        turn: 1,
        modelId: originalModel.canonicalId,
        outcome: "settled",
        promptAccepted: true,
      });
      return { kind: "failed", failureCode: "missing-structured-output", diagnostics };
    });

    await runReviewer({ ...invocation, recoveryModel: originalModel });
  });

  it("stops the chain after a decline even when a recovery model is configured", async () => {
    mocks.runIsolatedChild.mockImplementation(async (config) => {
      const retained = view([{ role: "assistant", content: [] }]);
      await config.continuation.resolveNext({
        session: retained,
        initialFailureCode: "missing-completion",
        nextTurn: 1,
      });
      config.declineHolder.choice = "declined";
      config.declineHolder.reason = "retained history is insufficient";
      const next = await config.continuation.resolveNext({
        session: retained,
        initialFailureCode: "missing-completion",
        nextTurn: 2,
      });
      expect(next).toBeUndefined();
      config.continuation.onTurn({
        turn: 1,
        modelId: originalModel.canonicalId,
        outcome: "settled",
        promptAccepted: true,
      });
      return { kind: "failed", failureCode: "missing-structured-output", diagnostics };
    });

    await expect(runReviewer({ ...invocation, recoveryModel })).resolves.toMatchObject({
      kind: "failed",
      submissionRecovery: { status: "declined", attempts: [{ outcome: "declined" }] },
    });
  });

  it("redacts and bounds a decline while retaining the original failure", async () => {
    mocks.runIsolatedChild.mockImplementation(async (config) => {
      config.onSessionCreated?.(view([{ role: "assistant", content: [] }]));
      await config.continuation.resolveNext({
        session: view([{ role: "assistant", content: [] }]),
        initialFailureCode: "missing-completion",
        nextTurn: 1,
      });
      config.declineHolder.choice = "declined";
      config.declineHolder.reason = `  Cannot\u0000 use token=secret-value ${"x".repeat(2_100)}  `;
      config.continuation.onTurn({
        turn: 1,
        modelId: originalModel.canonicalId,
        outcome: "settled",
        promptAccepted: true,
      });
      return { kind: "failed", failureCode: "missing-structured-output", diagnostics };
    });

    const result = await runReviewer(invocation);
    expect(result).toMatchObject({
      kind: "failed",
      failureCode: "missing-structured-output",
      submissionRecovery: {
        status: "declined",
        attempts: [{ modelId: originalModel.canonicalId, outcome: "declined" }],
      },
    });
    if (!("submissionRecovery" in result) || !result.submissionRecovery) return;
    expect(result.submissionRecovery.declineReason?.length).toBeLessThanOrEqual(2_000);
    // biome-ignore lint/security/noSecrets: verifies the public redaction marker.
    expect(result.submissionRecovery.declineReason).toContain("token=[REDACTED]");
    expect(result.submissionRecovery.declineReason).not.toContain("secret-value");
  });

  it("redacts colon, JSON, and bearer secret forms", () => {
    const marker = "[REDACTED]";
    const result = redactDeclineSecrets(
      'token: colon-value {"password":"json-value"} Bearer bearer-value',
    );

    expect(result).toContain(`token: ${marker}`);
    expect(result).toContain(`"password":"${marker}"`);
    expect(result).toContain(`Bearer ${marker}`);
    expect(result).not.toContain("colon-value");
    expect(result).not.toContain("json-value");
    expect(result).not.toContain("bearer-value");
  });

  it("omits recovery provenance when cancellation wins after step selection", async () => {
    mocks.runIsolatedChild.mockImplementation(async (config) => {
      await config.continuation.resolveNext({
        session: view([{ role: "assistant", content: [] }]),
        initialFailureCode: "missing-completion",
        nextTurn: 1,
      });
      config.holder.value = {
        summary: "Late",
        findings: [],
        criteriaCoverage: { status: "complete" },
      };
      return { kind: "canceled", diagnostics };
    });

    await expect(runReviewer(invocation)).resolves.not.toHaveProperty("submissionRecovery");
  });

  it("does not recover without retained assistant or tool evidence", async () => {
    mocks.runIsolatedChild.mockImplementation(async (config) => {
      config.onSessionCreated?.(view([{ role: "user", content: "packet" }]));
      const step = await config.continuation.resolveNext({
        session: view([]),
        initialFailureCode: "missing-completion",
        nextTurn: 1,
      });
      expect(step).toBeUndefined();
      return { kind: "failed", failureCode: "missing-structured-output", diagnostics };
    });

    await expect(runReviewer(invocation)).resolves.not.toHaveProperty("submissionRecovery");
  });

  it("adds recovery and model-switch host markers to one audit trace", async () => {
    const trace = new ReviewAuditTraceCollector(() => 10);
    trace.markRecovery({ type: "recovery_turn_start", modelId: originalModel.canonicalId });
    trace.markRecovery({ type: "model_switch_succeeded", modelId: recoveryModel.canonicalId });
    trace.markRecovery({
      type: "recovery_turn_end",
      modelId: recoveryModel.canonicalId,
      outcome: "settled",
    });

    expect(trace.snapshot(view([])).trace.timeline).toEqual([
      { atMs: 0, type: "recovery_turn_start", modelId: originalModel.canonicalId },
      { atMs: 0, type: "model_switch_succeeded", modelId: recoveryModel.canonicalId },
      {
        atMs: 0,
        type: "recovery_turn_end",
        modelId: recoveryModel.canonicalId,
        outcome: "settled",
      },
    ]);
  });

  it("reports exhausted recovery and exact per-turn usage deltas", async () => {
    const firstUsage = usage(2);
    mocks.runIsolatedChild.mockImplementation(async (config) => {
      config.onSessionCreated?.(view([{ role: "assistant", content: [] }]));
      await config.continuation.resolveNext({
        session: view([{ role: "assistant", content: [] }]),
        initialFailureCode: "unexpected-runner-failure",
        nextTurn: 1,
      });
      config.continuation.onTurn({
        turn: 1,
        modelId: originalModel.canonicalId,
        outcome: "settled",
        promptAccepted: true,
        usage: firstUsage,
      });
      config.continuation.onTurn({
        turn: 2,
        modelId: recoveryModel.canonicalId,
        outcome: "model-switch-failed",
        promptAccepted: false,
      });
      return {
        kind: "failed",
        failureCode: "unexpected-runner-failure",
        diagnostics,
        usage: usage(9),
      };
    });

    await expect(runReviewer({ ...invocation, recoveryModel })).resolves.toMatchObject({
      kind: "failed",
      usage: usage(9),
      submissionRecovery: {
        status: "exhausted",
        attempts: [
          {
            modelId: originalModel.canonicalId,
            outcome: "no-terminal-output",
            usage: firstUsage,
          },
          { modelId: recoveryModel.canonicalId, outcome: "model-switch-failed" },
        ],
      },
    });
  });
});

function usage(value: number) {
  return {
    input: value,
    output: value,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: value * 2,
    cost: { input: value, output: value, cacheRead: 0, cacheWrite: 0, total: value * 2 },
  };
}
