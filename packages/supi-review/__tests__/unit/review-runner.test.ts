import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  reload: vi.fn(),
  runWithLifecycle: vi.fn(),
  settingsManager: { marker: "isolated" },
}));
vi.mock("@earendil-works/pi-ai", async (original) => ({
  ...(await original()),
  clampThinkingLevel: () => "off",
}));
vi.mock("@earendil-works/pi-coding-agent", async (original) => ({
  ...(await original()),
  createAgentSession: mocks.createAgentSession,
}));
vi.mock("../../src/tool/child-resource-loader.ts", () => ({
  createIsolatedChildResources: () => ({
    loader: { reload: mocks.reload },
    settingsManager: mocks.settingsManager,
  }),
}));
vi.mock("../../src/tool/session-lifecycle.ts", () => ({
  runWithLifecycle: mocks.runWithLifecycle,
}));

import { runReviewer } from "../../src/tool/review-runner.ts";
import type { ReviewModelSelection, ReviewSnapshot } from "../../src/types.ts";

const snapshot: ReviewSnapshot = {
  repositoryRoot: "/repo",
  requestedTarget: { kind: "working-tree" },
  target: { kind: "working-tree", headCommit: "a".repeat(40) },
  title: "Working tree",
  changes: [{ status: "M", path: "a.ts", additions: 1, deletions: 0 }],
  diffHash: "b".repeat(64),
  stats: { files: 1, additions: 1, deletions: 0 },
};
const model = { canonicalId: "provider/model", model: {} } as ReviewModelSelection;

describe("runReviewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reload.mockResolvedValue(undefined);
    mocks.createAgentSession.mockResolvedValue({
      session: {
        bindExtensions: vi.fn(),
        subscribe: vi.fn(() => vi.fn()),
        messages: [
          {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "private" },
              { type: "text", text: "visible" },
            ],
            usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: {} },
          },
        ],
        getActiveToolNames: () => [
          "read",
          "bash",
          "code_resolve",
          "code_inspect",
          "code_orientation",
          "code_graph",
          "code_find",
          "code_health",
          "submit_review",
        ],
      },
      extensionsResult: { errors: [] },
    });
    mocks.runWithLifecycle.mockResolvedValue({
      kind: "failed",
      failureCode: "session-creation-failed",
      modelId: model.canonicalId,
    });
  });

  it("reports progress only at meaningful lifecycle boundaries", async () => {
    const onProgress = vi.fn();
    await runReviewer({
      cwd: "/repo",
      snapshot,
      task: { id: "spec", instructions: "Review." },
      prompt: "exact packet bytes",
      packetHash: "c".repeat(64),
      model,
      onProgress,
    });

    const lifecycle = mocks.runWithLifecycle.mock.calls[0]?.[0] as {
      onEvent: (event: { type: string }, ctx: Record<string, unknown>) => void;
    };
    const ctx = {
      progress: { turns: 0, toolUses: 0 },
      session: {
        getSessionStats: () => ({ tokens: { input: 1, output: 2, total: 3 } }),
      },
    };

    lifecycle.onEvent({ type: "message_update" }, ctx);
    expect(onProgress).not.toHaveBeenCalled();
    lifecycle.onEvent({ type: "turn_end" }, ctx);
    expect(onProgress).toHaveBeenCalledWith({
      turns: 1,
      toolUses: 0,
      tokens: { input: 1, output: 2, total: 3, cacheRead: undefined, cacheWrite: undefined },
    });
  });

  it("persists an opted-in local replay without provider thinking", async () => {
    const create = vi.fn().mockResolvedValue({
      artifactId: "review-audit-11111111-1111-1111-1111-111111111111",
      expiresAt: "2026-01-08T00:00:00.000Z",
    });
    mocks.runWithLifecycle.mockResolvedValue({
      kind: "success",
      modelId: model.canonicalId,
      submission: { summary: "Done", findings: [] },
    });

    const result = await runReviewer({
      cwd: "/repo",
      snapshot,
      task: { id: "spec", instructions: "Review." },
      prompt: "exact packet bytes",
      packetHash: "c".repeat(64),
      model,
      audit: {
        store: { create } as never,
        workspaceReceipt: {
          status: "verified",
          targetKind: "working-tree",
          baselineRevision: "a".repeat(40),
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
    expect(result.audit?.artifactId).toMatch(/^review-audit-/);
  });

  it("wires read, bash, headless Code Intelligence, and submit_review with isolated settings", async () => {
    await runReviewer({
      cwd: "/repo",
      snapshot,
      task: { id: "spec", instructions: "Review." },
      prompt: "exact packet bytes",
      packetHash: "c".repeat(64),
      model,
    });

    expect(mocks.createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        settingsManager: mocks.settingsManager,
        tools: [
          "read",
          "bash",
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
    expect(mocks.runWithLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "exact packet bytes", timeoutMs: undefined }),
    );
  });
});
