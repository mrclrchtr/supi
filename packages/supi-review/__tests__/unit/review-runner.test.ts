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
    mocks.createAgentSession.mockResolvedValue({ session: {} });
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

  it("wires only fixed review tools, isolated settings, exact prompt, and no automatic timeout", async () => {
    await runReviewer({
      cwd: "/repo",
      snapshot,
      task: { id: "spec", instructions: "Review." },
      prompt: "exact packet bytes",
      model,
    });

    expect(mocks.createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        settingsManager: mocks.settingsManager,
        tools: [
          "list_review_changes",
          "list_review_files",
          "read_review_diff",
          "read_review_file",
          "search_review_files",
          "submit_review",
        ],
      }),
    );
    expect(mocks.runWithLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "exact packet bytes", timeoutMs: undefined }),
    );
  });
});
