import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getHandlerOrThrow, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveReviewSnapshot: vi.fn(),
  fingerprintReviewSnapshot: vi.fn(async () => "snapshot-fingerprint"),
  checkReviewSnapshotFreshness: vi.fn(async () => ({ fresh: true as const })),
  synthesizeReviewBrief: vi.fn(),
  runReviewer: vi.fn(),
  recordDebugEvent: vi.fn(),
}));

vi.mock("../../src/git.ts", () => ({
  resolveReviewSnapshot: mocks.resolveReviewSnapshot,
  fingerprintReviewSnapshot: mocks.fingerprintReviewSnapshot,
  checkReviewSnapshotFreshness: mocks.checkReviewSnapshotFreshness,
  isCommitObjectId: (value: string) => /^[0-9a-f]{7,64}$/i.test(value),
  summarizeReviewSnapshot: (snapshot: {
    target: unknown;
    title: string;
    changedFiles: string[];
    stats: unknown;
  }) => ({
    target: snapshot.target,
    title: snapshot.title,
    changedFiles: snapshot.changedFiles,
    stats: snapshot.stats,
  }),
}));

vi.mock("../../src/history/synthesize.ts", () => ({
  BRIEF_SYNTHESIS_PROMPT_VERSION: "handoff-v1",
  synthesizeReviewBrief: mocks.synthesizeReviewBrief,
}));

vi.mock("../../src/tool/review-runner.ts", () => ({
  runReviewer: mocks.runReviewer,
}));

vi.mock("@mrclrchtr/supi-core/debug", () => ({
  recordDebugEvent: mocks.recordDebugEvent,
}));

vi.mock("../../src/config.ts", () => ({
  loadReviewConfig: () => ({ agentModel: "current" }),
}));

import { registerAgentReviewTools } from "../../src/tool/agent-review-tools.ts";
import type { ReviewModelSelection, ReviewSnapshot } from "../../src/types.ts";

const model = {
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
    reasoning: true,
    contextWindow: 200_000,
    maxTokens: 8_000,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
} as ReviewModelSelection;

const snapshot: ReviewSnapshot = {
  target: { kind: "working-tree" },
  title: "Working tree changes",
  changedFiles: ["src/auth.ts"],
  diffText: "diff --git a/src/auth.ts b/src/auth.ts\n+guard();",
  stats: { files: 1, additions: 1, deletions: 0 },
};

const brief = {
  summary: "Guard the auth flow",
  intendedOutcome: "Reject missing tokens",
  constraints: ["Keep the public API stable"],
  focusAreas: ["Authentication"],
  riskyFiles: ["src/auth.ts"],
  unresolvedQuestions: [],
  reviewInstructionBlockIds: [],
};

function makeToolCtx() {
  return makeCtx({
    model: model.model,
    modelRegistry: {},
    sessionManager: {
      getEntries: () => [],
      getLeafId: () => null,
      getBranch: () => [],
    },
  });
}

async function preparePlan(pi: ReturnType<typeof createPiMock>): Promise<string> {
  const prepare = getTool(pi, "supi_review_prepare");
  const result = (await prepare.execute(
    "prepare-handoff",
    {},
    undefined,
    undefined,
    makeToolCtx(),
  )) as { details: { planId: string } };
  return result.details.planId;
}

describe("agent review prepare/run handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveReviewSnapshot.mockResolvedValue(snapshot);
    mocks.fingerprintReviewSnapshot.mockResolvedValue("snapshot-fingerprint");
    mocks.checkReviewSnapshotFreshness.mockResolvedValue({ fresh: true });
    mocks.synthesizeReviewBrief.mockResolvedValue({ kind: "success", brief });
    mocks.runReviewer.mockResolvedValue({
      kind: "success",
      snapshot,
      brief,
      modelId: model.canonicalId,
      output: {
        items: [],
        overall_explanation: "No issues found.",
        overall_confidence_score: 0.9,
      },
    });
  });

  it("passes the real prepared plan through the shared store into run", async () => {
    const pi = createPiMock();
    registerAgentReviewTools(pi as unknown as ExtensionAPI);
    pi.setActiveTools(["read", "supi_review_prepare", "supi_review_run"]);
    await getHandlerOrThrow(pi, "session_start")({}, makeToolCtx());

    const planId = await preparePlan(pi);
    expect(planId).toMatch(/^review-plan-/);
    expect(pi.getActiveTools()).toContain("supi_review_run");

    const revisedBrief = { ...brief, focusAreas: ["Authentication", "Regression coverage"] };
    const completions: Array<() => void> = [];
    mocks.runReviewer.mockImplementation(
      (invocation: { brief: typeof brief }) =>
        new Promise((resolve) => {
          completions.push(() =>
            resolve({
              kind: "success",
              snapshot,
              brief: invocation.brief,
              modelId: model.canonicalId,
              output: {
                items: [],
                overall_explanation: "No issues found.",
                overall_confidence_score: 0.9,
              },
            }),
          );
        }),
    );

    const run = getTool(pi, "supi_review_run");
    const running = run.execute(
      "run-handoff",
      {
        planId,
        critique: {
          verdict: "revise",
          summary: "The generated brief omitted regression coverage.",
          findings: [
            {
              kind: "omission",
              field: "focusAreas",
              explanation: "Regression coverage is missing.",
              evidence: "The user requested a regression test.",
              proposedChange: "Add regression coverage to focusAreas.",
            },
          ],
        },
        revisedBrief,
        reviewers: [
          { id: "standards", focus: "Check repository standards." },
          { id: "spec", focus: "Check requested behavior." },
        ],
      },
      undefined,
      undefined,
      makeToolCtx(),
    );

    await vi.waitFor(() => expect(mocks.runReviewer).toHaveBeenCalledTimes(2));
    expect(mocks.runReviewer.mock.calls[0]?.[0]?.brief.focusAreas).toEqual(revisedBrief.focusAreas);
    expect(mocks.runReviewer.mock.calls[1]?.[0]?.brief.focusAreas).toEqual(revisedBrief.focusAreas);
    for (const complete of completions) complete();

    const result = (await running) as {
      details: {
        evaluation: {
          planId: string;
          generatedBrief: { focusAreas: string[] };
          effectiveBrief: { focusAreas: string[] };
        };
        results: Array<{ assignment: { id: string } }>;
      };
    };
    expect(result.details.evaluation.planId).toBe(planId);
    expect(result.details.evaluation.generatedBrief.focusAreas).toEqual(["Authentication"]);
    expect(result.details.evaluation.effectiveBrief.focusAreas).toEqual(revisedBrief.focusAreas);
    expect(result.details.results.map((entry) => entry.assignment.id)).toEqual([
      "standards",
      "spec",
    ]);
    await expect(
      run.execute(
        "run-consumed",
        {
          planId,
          critique: { verdict: "accept", summary: "Retry", findings: [] },
          reviewers: [{ id: "retry", focus: "Must not start." }],
        },
        undefined,
        undefined,
        makeToolCtx(),
      ),
    ).rejects.toThrow("was not found in this session");
  });

  it("clears prepared plans when the session is reloaded", async () => {
    const pi = createPiMock();
    registerAgentReviewTools(pi as unknown as ExtensionAPI);
    const planId = await preparePlan(pi);

    await getHandlerOrThrow(pi, "session_start")({}, makeToolCtx());

    const run = getTool(pi, "supi_review_run");
    await expect(
      run.execute(
        "run-after-reload",
        {
          planId,
          critique: { verdict: "accept", summary: "After reload", findings: [] },
          reviewers: [{ id: "spec", focus: "Must not start." }],
        },
        undefined,
        undefined,
        makeToolCtx(),
      ),
    ).rejects.toThrow("was not found in this session");
    expect(pi.getActiveTools()).not.toContain("supi_review_run");
  });
});
