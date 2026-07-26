import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { removeSupiConfigKey, writeSupiConfig } from "@mrclrchtr/supi-core/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveReviewSnapshot: vi.fn(),
  fingerprintReviewSnapshot: vi.fn(() => "snapshot-fingerprint"),
  checkReviewSnapshotFreshness: vi.fn(async () => ({ fresh: true as const })),
  synthesizeReviewBrief: vi.fn(),
  runReviewer: vi.fn(),
}));

vi.mock("../../src/git.ts", () => ({
  resolveReviewSnapshot: mocks.resolveReviewSnapshot,
  fingerprintReviewSnapshot: mocks.fingerprintReviewSnapshot,
  checkReviewSnapshotFreshness: mocks.checkReviewSnapshotFreshness,
  summarizeReviewSnapshot: (snapshot: typeof reviewSnapshot) => ({
    target: snapshot.target,
    title: snapshot.title,
    changedFiles: snapshot.changedFiles,
    stats: snapshot.stats,
  }),
}));
vi.mock("../../src/history/synthesize.ts", () => ({
  BRIEF_SYNTHESIS_PROMPT_VERSION: "config-integration-v1",
  synthesizeReviewBrief: mocks.synthesizeReviewBrief,
}));
vi.mock("../../src/tool/review-runner.ts", () => ({ runReviewer: mocks.runReviewer }));

import { loadReviewConfig, REVIEW_CONFIG_SECTION } from "../../src/config.ts";
import { resolveAgentReviewModel } from "../../src/model.ts";
import { ReviewPlanStore } from "../../src/session/review-plan-store.ts";
import {
  prepareAgentReviewPlan,
  runAgentReviewBatch,
} from "../../src/tool/agent-review-workflow.ts";
import type {
  ReviewInvocation,
  ReviewModelSelection,
  ReviewSnapshot,
  SynthesizedReviewBrief,
} from "../../src/types.ts";

function reviewModel(provider: string, id: string): ReviewModelSelection {
  return {
    canonicalId: `${provider}/${id}`,
    provider,
    id,
    label: id,
    description: `${provider}/${id}`,
    isCurrent: false,
    model: {
      provider,
      id,
      name: id,
      reasoning: true,
      contextWindow: 128_000,
      maxTokens: 8_000,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    },
  } as ReviewModelSelection;
}

const globalModel = reviewModel("anthropic", "claude-sonnet-4");
const projectModel = reviewModel("openai", "gpt-5");
const laterModel = reviewModel("google", "gemini-2.5-pro");
const reviewSnapshot: ReviewSnapshot = {
  target: { kind: "working-tree" },
  title: "Working tree changes",
  changedFiles: ["src/auth.ts"],
  diffText: "+guard();",
  stats: { files: 1, additions: 1, deletions: 0 },
};
const brief: SynthesizedReviewBrief = {
  summary: "Guard auth",
  intendedOutcome: "Reject missing tokens",
  constraints: [],
  focusAreas: ["Authentication"],
  riskyFiles: ["src/auth.ts"],
  unresolvedQuestions: [],
  reviewInstructionBlockIds: [],
};

function writeModel(scope: "global" | "project", cwd: string, homeDir: string, modelId: string) {
  writeSupiConfig(
    { section: REVIEW_CONFIG_SECTION, scope, cwd },
    { agentModel: modelId },
    { homeDir },
  );
}

describe("configured agent-review model handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveReviewSnapshot.mockResolvedValue(reviewSnapshot);
    mocks.fingerprintReviewSnapshot.mockReturnValue("snapshot-fingerprint");
    mocks.checkReviewSnapshotFreshness.mockResolvedValue({ fresh: true });
    mocks.synthesizeReviewBrief.mockResolvedValue({ kind: "success", brief });
    mocks.runReviewer.mockImplementation(async (invocation: ReviewInvocation) => ({
      kind: "success",
      output: {
        items: [],
        overall_explanation: "No issues found.",
        overall_confidence_score: 0.9,
      },
      snapshot: reviewSnapshot,
      brief,
      modelId: invocation.model.canonicalId,
    }));
  });

  it("pins the project-over-global model across later config and session changes", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "supi-review-model-handoff-"));
    const cwd = path.join(homeDir, "repo");
    fs.mkdirSync(cwd, { recursive: true });
    try {
      writeModel("global", cwd, homeDir, globalModel.canonicalId);
      writeModel("project", cwd, homeDir, projectModel.canonicalId);
      expect(loadReviewConfig(cwd, homeDir).agentModel).toBe(projectModel.canonicalId);
      removeSupiConfigKey({ section: REVIEW_CONFIG_SECTION, scope: "project", cwd }, "agentModel", {
        homeDir,
      });
      expect(loadReviewConfig(cwd, homeDir).agentModel).toBe(globalModel.canonicalId);
      writeModel("project", cwd, homeDir, projectModel.canonicalId);

      const ctx = {
        cwd,
        model: globalModel.model,
        modelRegistry: {
          getAvailable: () => [globalModel.model, projectModel.model, laterModel.model],
        },
      };
      const configured = loadReviewConfig(cwd, homeDir).agentModel;
      const selected = resolveAgentReviewModel(ctx as never, configured, ["*/*"]);
      if (!selected) throw new Error("Expected configured model to resolve");
      const store = new ReviewPlanStore();
      const prepared = await prepareAgentReviewPlan({
        cwd,
        target: { kind: "working-tree" },
        serializedContext: "[User]\nReview this.",
        model: selected,
        planStore: store,
      });
      if (prepared.kind !== "prepared") throw new Error("Expected prepared plan");

      writeModel("project", cwd, homeDir, laterModel.canonicalId);
      ctx.model = laterModel.model;
      const outcome = await runAgentReviewBatch({
        cwd,
        planId: prepared.plan.id,
        critique: { verdict: "accept", summary: "The brief is accurate.", findings: [] },
        reviewers: [
          { id: "spec", focus: "Check requested behavior." },
          { id: "standards", focus: "Check repository standards." },
        ],
        planStore: store,
      });

      expect(mocks.synthesizeReviewBrief).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.objectContaining({ canonicalId: "openai/gpt-5" }),
        }),
      );
      expect(mocks.runReviewer).toHaveBeenCalledTimes(2);
      for (const [invocation] of mocks.runReviewer.mock.calls) {
        expect(invocation.model.canonicalId).toBe(projectModel.canonicalId);
      }
      expect(outcome).toMatchObject({
        kind: "completed",
        details: { evaluation: { synthesizerModelId: projectModel.canonicalId } },
      });
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
