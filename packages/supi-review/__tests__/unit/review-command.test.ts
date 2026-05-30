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

vi.mock("@mrclrchtr/supi-core/tool-framework", () => ({
  runWithProgressWidget: vi.fn((_pi, _ctx, _title, runner) => {
    const controller = new AbortController();
    return runner(controller.signal, () => {});
  }),
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
  reviewInstructionBlockIds: [],
};

const packet = {
  prompt: "# Review Task",
};

function buildReviewItem(overrides: Record<string, unknown> = {}) {
  return {
    title: "Missing guard",
    body: "Null token path is not checked",
    category: "correctness",
    impact: "high",
    effort: "low",
    recommended_action: "must-fix",
    confidence_score: 0.9,
    suggested_fix: "Add an early null guard before using the token.",
    verification_hint: "Run the auth-path tests and confirm null token input fails cleanly.",
    code_location: {
      absolute_file_path: "/project/src/auth.ts",
      line_range: { start: 4, end: 5 },
    },
    ...overrides,
  };
}

function createRawReviewOutput(items: Array<Record<string, unknown>> = []) {
  return {
    items,
    overall_explanation: items.length > 0 ? "See review items" : "Looks good",
    overall_confidence_score: 0.85,
  };
}

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

function findFollowUpMessage(sendMessage: ReturnType<typeof vi.fn>) {
  return sendMessage.mock.calls.find(
    (call: unknown[]) =>
      (call[0] as Record<string, unknown>)?.customType === "supi-review-followup",
  );
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
      output: createRawReviewOutput(),
    });
  });

  it("runs the session-aware review flow and renders normalized review output", async () => {
    const pi = createPi();
    reviewExtension(pi);
    const handler = getHandler(pi);
    if (!handler) throw new Error("Handler not registered");

    await expect(handler("", makeCtx({ cwd: "/project" }))).resolves.toBeUndefined();

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

  it("queues an agent follow-up when the normalized review has actionable items", async () => {
    const pi = createPi();
    reviewExtension(pi);
    const handler = getHandler(pi);
    if (!handler) throw new Error("Handler not registered");

    mockFns.runReviewer.mockResolvedValue({
      kind: "success",
      snapshot,
      brief,
      modelId: modelSelection.canonicalId,
      output: createRawReviewOutput([buildReviewItem()]),
    });

    await expect(handler("", makeCtx())).resolves.toBeUndefined();

    const sendMessage = pi.sendMessage as ReturnType<typeof vi.fn>;
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[1]?.[0]).toMatchObject({
      customType: "supi-review-followup",
      display: false,
      details: {
        itemCount: 1,
        actionSummary: { mustFix: 1, shouldFix: 0, consider: 0 },
        items: [{ number: 1, title: "Missing guard", recommended_action: "must-fix" }],
      },
    });
    expect(sendMessage.mock.calls[1]?.[0]?.content).toContain("must-fix");
    expect(sendMessage.mock.calls[1]?.[0]?.content).toContain("Fix all");
    expect(sendMessage.mock.calls[1]?.[0]?.content).toContain("Fix selected");
    expect(sendMessage.mock.calls[1]?.[0]?.content).toContain("Verify findings");
    expect(sendMessage.mock.calls[1]?.[0]?.content).toContain("Skip");
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

  describe("follow-up triage branching by recommended_action", () => {
    async function runWithItems(items: Array<Record<string, unknown>>) {
      const pi = createPi();
      reviewExtension(pi);
      const handler = getHandler(pi);
      if (!handler) throw new Error("Handler not registered");

      mockFns.runReviewer.mockResolvedValue({
        kind: "success",
        snapshot,
        brief,
        modelId: modelSelection.canonicalId,
        output: createRawReviewOutput(items),
      });

      await expect(handler("", makeCtx())).resolves.toBeUndefined();
      const sendMessage = pi.sendMessage as ReturnType<typeof vi.fn>;
      const followUpCall = findFollowUpMessage(sendMessage);
      return {
        content: (followUpCall?.[0] as Record<string, unknown>)?.content as string | undefined,
        details: (followUpCall?.[0] as Record<string, unknown>)?.details as
          | Record<string, unknown>
          | undefined,
      };
    }

    it("highlights must-fix items in the follow-up summary", async () => {
      const { content, details } = await runWithItems([buildReviewItem()]);

      expect(content).toContain("1 must-fix");
      expect(content).toContain("Current review items");
      expect(details).toMatchObject({
        actionSummary: { mustFix: 1, shouldFix: 0, consider: 0 },
      });
    });

    it("highlights should-fix items without must-fix urgency", async () => {
      const { content, details } = await runWithItems([
        buildReviewItem({
          title: "Expand test coverage",
          category: "test-gap",
          impact: "medium",
          recommended_action: "should-fix",
        }),
      ]);

      expect(content).toContain("1 should-fix");
      expect(content).not.toContain("1 must-fix");
      expect(details).toMatchObject({
        actionSummary: { mustFix: 0, shouldFix: 1, consider: 0 },
      });
    });

    it("still queues follow-up for consider-only items", async () => {
      const { content, details } = await runWithItems([
        buildReviewItem({
          title: "Maintainer note",
          category: "maintainer",
          impact: "low",
          recommended_action: "consider",
        }),
      ]);

      expect(content).toContain("1 consider");
      expect(content).toContain("Fix selected");
      expect(details).toMatchObject({
        actionSummary: { mustFix: 0, shouldFix: 0, consider: 1 },
      });
    });

    it("skips follow-up when there are no review items", async () => {
      const pi = createPi();
      reviewExtension(pi);
      const handler = getHandler(pi);
      if (!handler) throw new Error("Handler not registered");

      mockFns.runReviewer.mockResolvedValue({
        kind: "success",
        snapshot,
        brief,
        modelId: modelSelection.canonicalId,
        output: createRawReviewOutput([]),
      });

      await expect(handler("", makeCtx())).resolves.toBeUndefined();
      const sendMessage = pi.sendMessage as ReturnType<typeof vi.fn>;
      const followUpCall = findFollowUpMessage(sendMessage);
      expect(followUpCall).toBeUndefined();
    });
  });
});
