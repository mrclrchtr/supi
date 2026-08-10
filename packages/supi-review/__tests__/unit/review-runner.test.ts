import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runIsolatedChild: vi.fn(),
}));

vi.mock("../../src/tool/child-session-runner.ts", () => ({
  runIsolatedChild: mocks.runIsolatedChild,
}));

import type { AgentRunSessionView } from "@mrclrchtr/supi-agent-runtime/api";
import { runReviewer } from "../../src/tool/review-runner.ts";
import type { ReviewModelSelection, ReviewSnapshot } from "../../src/types.ts";

const snapshot: ReviewSnapshot = {
  repositoryRoot: "/repo",
  requestedTarget: {},
  target: { fromCommit: "a".repeat(40), toCommit: "a".repeat(40), includeUncommittedChanges: true },
  title: "Working tree",
  changes: [{ status: "M", path: "a.ts", additions: 1, deletions: 0 }],
  diffHash: "b".repeat(64),
  stats: { files: 1, additions: 1, deletions: 0 },
};
const model = { canonicalId: "provider/model", model: {} } as ReviewModelSelection;
const diagnostics = { lifecycleTrace: { entries: [], droppedCount: 0 }, turns: 0, toolUses: 0 };

function createView(
  activeTools = [
    "read",
    "bash",
    "grep",
    "code_resolve",
    "code_inspect",
    "code_orientation",
    "code_graph",
    "code_find",
    "code_health",
    "submit_review",
  ],
): AgentRunSessionView {
  return {
    cwd: "/repo",
    model: undefined,
    thinkingLevel: "off",
    isStreaming: false,
    messages: [
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "private" },
          { type: "text", text: "visible" },
        ],
      },
    ],
    getActiveToolNames: () => [...activeTools],
    getSessionStats: () => ({ tokens: { input: 1, output: 2, total: 3 } }) as never,
    getLastAssistantText: () => "visible",
    subscribe: vi.fn(() => vi.fn()),
  };
}

describe("runReviewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runIsolatedChild.mockResolvedValue({
      kind: "failed",
      failureCode: "session-creation-failed",
    });
  });

  const invocation = {
    cwd: "/repo",
    snapshot,
    task: { id: "spec", instructions: "Review.", mode: "change" as const },
    prompt: "exact packet bytes",
    packetHash: "c".repeat(64),
    model,
  };

  it("forwards runtime progress to the review adapter", async () => {
    const onProgress = vi.fn();
    mocks.runIsolatedChild.mockImplementation(async (config) => {
      config.onProgress?.({ turns: 1, toolUses: 0, toolErrors: 1 });
      return { kind: "failed", failureCode: "session-creation-failed" };
    });

    await runReviewer({ ...invocation, onProgress });

    expect(onProgress).toHaveBeenCalledWith({ turns: 1, toolUses: 0, toolErrors: 1 });
  });

  it("persists an opted-in local replay without provider thinking", async () => {
    const create = vi.fn().mockResolvedValue({
      artifactId: "review-audit-11111111-1111-1111-1111-111111111111",
      expiresAt: "2026-01-08T00:00:00.000Z",
    });
    const view = createView();
    mocks.runIsolatedChild.mockImplementation(async (config) => {
      const cleanup = config.onSessionCreated?.(view);
      cleanup?.();
      return {
        kind: "success",
        value: { summary: "Done", findings: [], criteriaCoverage: { status: "complete" } },
      };
    });

    const result = await runReviewer({
      ...invocation,
      audit: {
        store: { create } as never,
        workspaceReceipt: {
          status: "verified",
          fromCommit: "a".repeat(40),
          toCommit: "a".repeat(40),
          includeUncommittedChanges: true,
          expectedWorkspaceHead: "a".repeat(40),
          observedWorkspaceHead: "a".repeat(40),
          expectedDiffHash: "b".repeat(64),
          observedDiffHash: "b".repeat(64),
          changedPathCount: 1,
        },
      },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ packet: "exact packet bytes", packetHash: "c".repeat(64) }),
    );
    expect(JSON.stringify(create.mock.calls[0]?.[0])).not.toContain("private");
    expect(create.mock.calls[0]?.[0].messages).toEqual([
      { role: "assistant", content: [{ type: "text", text: "visible" }] },
    ]);
    expect(result.audit?.artifactId).toMatch(/^review-audit-/);
  });

  it("wires the review tool allowlist and isolated prompt through the runtime adapter", async () => {
    await runReviewer(invocation);

    expect(mocks.runIsolatedChild).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "exact packet bytes",
        timeoutMs: undefined,
        tools: [
          "read",
          "bash",
          "grep",
          "code_resolve",
          "code_inspect",
          "code_orientation",
          "code_graph",
          "code_find",
          "code_health",
          "submit_review",
        ],
      }),
    );
  });

  it("maps each runtime outcome into a reviewer result carrying modelId", async () => {
    mocks.runIsolatedChild.mockImplementationOnce(async (config) => {
      config.onSessionCreated?.(createView());
      return {
        kind: "success",
        value: { summary: "Done", findings: [], criteriaCoverage: { status: "complete" } },
      };
    });
    await expect(runReviewer(invocation)).resolves.toEqual({
      kind: "success",
      value: { summary: "Done", findings: [], criteriaCoverage: { status: "complete" } },
      modelId: model.canonicalId,
      reviewerExtensionSetStatus: "active",
    });

    mocks.runIsolatedChild.mockImplementationOnce(async (config) => {
      config.onSessionCreated?.(createView());
      return { kind: "timeout", timeoutMs: 1234, diagnostics };
    });
    await expect(runReviewer(invocation)).resolves.toEqual({
      kind: "timeout",
      timeoutMs: 1234,
      diagnostics,
      modelId: model.canonicalId,
      reviewerExtensionSetStatus: "active",
    });

    mocks.runIsolatedChild.mockResolvedValueOnce({
      kind: "failed",
      failureCode: "session-creation-failed",
    });
    await expect(runReviewer(invocation)).resolves.toEqual({
      kind: "failed",
      failureCode: "session-creation-failed",
      modelId: model.canonicalId,
      reviewerExtensionSetStatus: "unobserved",
    });
  });
});
