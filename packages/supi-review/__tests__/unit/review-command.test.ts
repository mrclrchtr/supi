import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  serializeSessionContext: vi.fn(() => "[User]\nTest message"),
  synthesizeReviewBrief: vi.fn(),
  buildReviewPacket: vi.fn(),
  runReviewer: vi.fn(),
  resolveWorkingTreeSnapshot: vi.fn(),
  resolveBranchSnapshot: vi.fn(),
  resolveCommitSnapshot: vi.fn(),
  selectTarget: vi.fn(),
  selectModel: vi.fn(),
  collectReviewNote: vi.fn(),
  previewReviewPlan: vi.fn(),
}));

vi.mock("../../src/history/collect.ts", () => ({
  serializeSessionContext: mockFns.serializeSessionContext,
}));

vi.mock("../../src/history/synthesize.ts", () => ({
  synthesizeReviewBrief: mockFns.synthesizeReviewBrief,
}));

vi.mock("../../src/target/packet.ts", () => ({
  buildReviewPacket: mockFns.buildReviewPacket,
}));

vi.mock("../../src/git.ts", () => ({
  resolveWorkingTreeSnapshot: mockFns.resolveWorkingTreeSnapshot,
  resolveBranchSnapshot: mockFns.resolveBranchSnapshot,
  resolveCommitSnapshot: mockFns.resolveCommitSnapshot,
}));

vi.mock("../../src/tool/review-runner.ts", () => ({
  runReviewer: mockFns.runReviewer,
}));

vi.mock("../../src/ui/flow.ts", () => ({
  selectTarget: mockFns.selectTarget,
  selectModel: mockFns.selectModel,
  collectReviewNote: mockFns.collectReviewNote,
  previewReviewPlan: mockFns.previewReviewPlan,
}));

vi.mock("../../src/ui/progress-widget.ts", () => ({
  ReviewProgressWidget: class MockReviewProgressWidget {
    private controller = new AbortController();
    onAbort: (() => void) | undefined;

    get signal() {
      return this.controller.signal;
    }

    updateProgress() {}
    dispose() {}
    render() {
      return ["running..."];
    }
    invalidate() {}
    handleInput() {}
  },
}));

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import reviewExtension from "../../src/review.ts";

const modelSelection = {
  canonicalId: "anthropic/claude-sonnet-4",
  provider: "anthropic",
  id: "claude-sonnet-4",
  label: "Claude Sonnet 4",
  description: "anthropic/claude-sonnet-4",
  isCurrent: true,
  model: {
    provider: "anthropic",
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    reasoning: false,
    contextWindow: 200_000,
    api: {} as never,
    baseUrl: "",
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    maxTokens: 8_000,
  },
};

const snapshot = {
  target: { kind: "working-tree" as const },
  title: "Working tree changes",
  changedFiles: ["src/auth.ts"],
  diffText: "diff --git a/src/auth.ts b/src/auth.ts",
  stats: { files: 1, additions: 1, deletions: 0 },
};

const brief = {
  summary: "Refactor auth flow",
  intendedOutcome: "Preserve auth semantics",
  constraints: ["Keep public API stable"],
  focusAreas: ["Authentication"],
  riskyFiles: ["src/auth.ts"],
  unresolvedQuestions: [],
};

const packet = {
  prompt: "# Review Task",
};

function createPi(): ExtensionAPI {
  return {
    registerCommand: vi.fn(),
    registerMessageRenderer: vi.fn(),
    on: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    events: { emit: vi.fn(), on: vi.fn() },
  } as unknown as ExtensionAPI;
}

function getHandler(pi: ExtensionAPI) {
  const registerMock = pi.registerCommand as ReturnType<typeof vi.fn>;
  return registerMock.mock.calls[0]?.[1]?.handler;
}

function makeCtx(overrides?: Record<string, unknown>) {
  return {
    cwd: "/project",
    hasUI: true,
    sessionManager: {
      getBranch: () => [],
      getEntries: () => [],
      getLeafId: () => null,
    },
    modelRegistry: {
      getAvailable: () => [modelSelection.model],
      find: () => modelSelection.model,
    },
    model: modelSelection.model,
    ui: {
      notify: vi.fn(),
      input: vi.fn(),
      confirm: vi.fn(),
      custom: vi.fn(
        (factory: (...args: unknown[]) => unknown) =>
          new Promise((resolve) => {
            factory({}, {}, undefined, resolve);
          }),
      ),
    },
    ...overrides,
  };
}

describe("/supi-review command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFns.selectTarget.mockResolvedValue({ kind: "working-tree" });
    mockFns.selectModel.mockResolvedValue(modelSelection);
    mockFns.collectReviewNote.mockResolvedValue("");
    mockFns.resolveWorkingTreeSnapshot.mockResolvedValue(snapshot);
    mockFns.synthesizeReviewBrief.mockResolvedValue({ kind: "success", brief });
    mockFns.buildReviewPacket.mockReturnValue(packet);
    mockFns.previewReviewPlan.mockResolvedValue(true);
    mockFns.runReviewer.mockResolvedValue({
      kind: "success",
      snapshot,
      brief,
      modelId: modelSelection.canonicalId,
      output: {
        findings: [],
        overall_correctness: "patch is correct",
        overall_explanation: "Looks good",
        overall_confidence_score: 0.9,
      },
    });
  });

  it("runs the new session-aware review flow with serialized context", async () => {
    const pi = createPi();
    reviewExtension(pi);
    const handler = getHandler(pi);
    if (!handler) throw new Error("Handler not registered");

    await handler("", makeCtx({ cwd: "/project" }));

    expect(mockFns.selectTarget).toHaveBeenCalledTimes(1);
    expect(mockFns.selectModel).toHaveBeenCalledTimes(1);
    expect(mockFns.serializeSessionContext).toHaveBeenCalledTimes(1);
    expect(mockFns.synthesizeReviewBrief).toHaveBeenCalledTimes(1);
    expect(mockFns.buildReviewPacket).toHaveBeenCalledWith(
      snapshot,
      expect.objectContaining({
        summary: brief.summary,
        intendedOutcome: brief.intendedOutcome,
        focusAreas: brief.focusAreas,
      }),
      modelSelection,
    );
    expect(mockFns.previewReviewPlan).toHaveBeenCalledTimes(1);
    expect(mockFns.runReviewer).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: packet.prompt, model: modelSelection }),
    );
    expect((pi.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.customType).toBe(
      "supi-review",
    );
  });

  it("queues an agent follow-up when the review finds issues", async () => {
    const pi = createPi();
    reviewExtension(pi);
    const handler = getHandler(pi);
    if (!handler) throw new Error("Handler not registered");

    mockFns.runReviewer.mockResolvedValue({
      kind: "success",
      snapshot,
      brief,
      modelId: modelSelection.canonicalId,
      output: {
        findings: [
          {
            title: "Missing guard",
            body: "Null token path is not checked",
            confidence_score: 0.9,
            priority: 2,
            code_location: {
              absolute_file_path: "/project/src/auth.ts",
              line_range: { start: 4, end: 5 },
            },
          },
        ],
        overall_correctness: "mostly correct",
        overall_explanation: "One issue remains",
        overall_confidence_score: 0.8,
      },
    });

    await handler("", makeCtx());

    const sendMessage = pi.sendMessage as ReturnType<typeof vi.fn>;
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[1]?.[0]).toMatchObject({
      customType: "supi-review-followup",
      display: false,
    });
    expect(sendMessage.mock.calls[1]?.[0]?.content).toContain("ask_user");
    expect(sendMessage.mock.calls[1]?.[1]).toMatchObject({ triggerTurn: true });
  });

  it("stops before running the reviewer when preview is rejected", async () => {
    const pi = createPi();
    reviewExtension(pi);
    const handler = getHandler(pi);
    if (!handler) throw new Error("Handler not registered");

    mockFns.previewReviewPlan.mockResolvedValue(false);

    await handler("", makeCtx());

    expect(mockFns.runReviewer).not.toHaveBeenCalled();
    expect(pi.sendMessage).not.toHaveBeenCalled();
  });

  it("stops immediately when target selection is canceled", async () => {
    const pi = createPi();
    reviewExtension(pi);
    const handler = getHandler(pi);
    if (!handler) throw new Error("Handler not registered");

    mockFns.selectTarget.mockResolvedValue(undefined);

    await handler("", makeCtx());

    expect(mockFns.selectModel).not.toHaveBeenCalled();
    expect(mockFns.synthesizeReviewBrief).not.toHaveBeenCalled();
  });

  describe("follow-up instruction branching by severity", () => {
    async function runWithFindings(findings: Array<Record<string, unknown>>) {
      const pi = createPi();
      reviewExtension(pi);
      const handler = getHandler(pi);
      if (!handler) throw new Error("Handler not registered");

      mockFns.runReviewer.mockResolvedValue({
        kind: "success",
        snapshot,
        brief,
        modelId: modelSelection.canonicalId,
        output: {
          findings,
          overall_correctness: "mostly correct",
          overall_explanation: "See findings",
          overall_confidence_score: 0.7,
        },
      });

      await handler("", makeCtx());
      const sendMessage = pi.sendMessage as ReturnType<typeof vi.fn>;
      const followUpCall = sendMessage.mock.calls.find(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>)?.customType === "supi-review-followup",
      );
      return (followUpCall?.[0] as Record<string, unknown>)?.content as string | undefined;
    }

    const baseFinding = {
      title: "Missing null check",
      body: "Null token path is not checked",
      confidence_score: 0.9,
      code_location: {
        absolute_file_path: "/project/src/auth.ts",
        line_range: { start: 4, end: 5 },
      },
    };

    const criticalFinding = { ...baseFinding, priority: 3 };
    const majorFinding = { ...baseFinding, priority: 2 };
    const minorFinding = { ...baseFinding, priority: 1 };
    const infoFinding = { ...baseFinding, priority: 0 };

    it("produces urgent message when findings include critical priority", async () => {
      const content = await runWithFindings([criticalFinding]);
      expect(content).toContain("⚠");
      expect(content).toContain("critical");
      expect(content).toContain("Fix all");
      expect(content).toContain("Fix critical only");
    });

    it("produces standard message for major findings without critical", async () => {
      const content = await runWithFindings([majorFinding]);
      expect(content).toContain("Fix all");
      expect(content).toContain("Fix selected");
      expect(content).toContain("Verify findings");
      expect(content).not.toContain("⚠");
    });

    it("produces light message for minor/info-only findings", async () => {
      const content = await runWithFindings([minorFinding, infoFinding]);
      expect(content).toContain("minor/info");
      expect(content).not.toContain("Fix selected");
    });

    function findFollowUpMessage(sendMessage: ReturnType<typeof vi.fn>) {
      return sendMessage.mock.calls.find(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>)?.customType === "supi-review-followup",
      );
    }

    it("notes contradiction when patch is marked correct but issues exist", async () => {
      const pi = createPi();
      reviewExtension(pi);
      const handler = getHandler(pi);
      if (!handler) throw new Error("Handler not registered");

      mockFns.runReviewer.mockResolvedValue({
        kind: "success",
        snapshot,
        brief,
        modelId: modelSelection.canonicalId,
        output: {
          findings: [minorFinding],
          overall_correctness: "patch is correct",
          overall_explanation: "Minor suggestion only",
          overall_confidence_score: 0.9,
        },
      });

      await handler("", makeCtx());
      const sendMessage = pi.sendMessage as ReturnType<typeof vi.fn>;
      const followUpCall = findFollowUpMessage(sendMessage);
      const content = (followUpCall?.[0] as Record<string, unknown>)?.content as string;
      expect(content).toContain("correct");
      expect(content).toContain("issues");
    });

    it("notes contradiction even with major findings", async () => {
      const pi = createPi();
      reviewExtension(pi);
      const handler = getHandler(pi);
      if (!handler) throw new Error("Handler not registered");

      mockFns.runReviewer.mockResolvedValue({
        kind: "success",
        snapshot,
        brief,
        modelId: modelSelection.canonicalId,
        output: {
          findings: [majorFinding],
          overall_correctness: "patch is correct",
          overall_explanation: "Contradictory",
          overall_confidence_score: 0.5,
        },
      });

      await handler("", makeCtx());
      const sendMessage = pi.sendMessage as ReturnType<typeof vi.fn>;
      const followUpCall = findFollowUpMessage(sendMessage);
      const content = (followUpCall?.[0] as Record<string, unknown>)?.content as string;
      expect(content).toContain("correct");
      expect(content).toContain("issues");
      // Should still offer standard options even with contradiction
      expect(content).toContain("Fix selected");
    });

    it("skips follow-up when there are no findings", async () => {
      const pi = createPi();
      reviewExtension(pi);
      const handler = getHandler(pi);
      if (!handler) throw new Error("Handler not registered");

      mockFns.runReviewer.mockResolvedValue({
        kind: "success",
        snapshot,
        brief,
        modelId: modelSelection.canonicalId,
        output: {
          findings: [],
          overall_correctness: "patch is correct",
          overall_explanation: "All good",
          overall_confidence_score: 0.95,
        },
      });

      await handler("", makeCtx());
      const sendMessage = pi.sendMessage as ReturnType<typeof vi.fn>;
      const followUpCall = findFollowUpMessage(sendMessage);
      expect(followUpCall).toBeUndefined();
    });
  });
});
