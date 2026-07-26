import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepareAgentReviewPlan: vi.fn(),
  runAgentReviewBatch: vi.fn(),
  loadReviewConfig: vi.fn(),
  resolveAgentReviewModel: vi.fn(),
}));

vi.mock("../../src/tool/agent-review-workflow.ts", () => ({
  prepareAgentReviewPlan: mocks.prepareAgentReviewPlan,
  runAgentReviewBatch: mocks.runAgentReviewBatch,
}));
vi.mock("../../src/config.ts", () => ({ loadReviewConfig: mocks.loadReviewConfig }));
vi.mock("../../src/model.ts", () => ({
  CURRENT_SESSION_REVIEW_MODEL: "current",
  resolveAgentReviewModel: mocks.resolveAgentReviewModel,
}));

import { registerAgentReviewTools } from "../../src/tool/agent-review-tools.ts";
import type {
  ReviewModelSelection,
  ReviewSnapshot,
  SynthesizedReviewBrief,
} from "../../src/types.ts";

const configuredModel = {
  canonicalId: "openai/gpt-5",
  provider: "openai",
  id: "gpt-5",
  label: "GPT-5",
  description: "openai/gpt-5",
  isCurrent: false,
  model: {
    provider: "openai",
    id: "gpt-5",
    name: "GPT-5",
    reasoning: true,
    contextWindow: 128_000,
    maxTokens: 8_000,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
} as ReviewModelSelection;

const snapshot: ReviewSnapshot = {
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

function toolContext() {
  return makeCtx({
    cwd: "/project",
    model: configuredModel.model,
    modelRegistry: {},
    sessionManager: { getEntries: () => [], getLeafId: () => null, getBranch: () => [] },
  });
}

describe("agent review model config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadReviewConfig.mockReturnValue({ agentModel: configuredModel.canonicalId });
    mocks.resolveAgentReviewModel.mockReturnValue(configuredModel);
    mocks.prepareAgentReviewPlan.mockImplementation(
      async (input: { model: ReviewModelSelection }) => ({
        kind: "prepared",
        plan: {
          id: "review-plan-model",
          snapshot,
          snapshotFingerprint: "fingerprint",
          generatedBrief: brief,
          model: input.model,
          briefPromptVersion: "1",
          createdAt: 1,
        },
      }),
    );
  });

  it("uses the configured model for review preparation", async () => {
    const pi = createPiMock();
    registerAgentReviewTools(pi as unknown as ExtensionAPI);

    const result = (await getTool(pi, "supi_review_prepare").execute(
      "prepare-configured-model",
      {},
      undefined,
      undefined,
      toolContext(),
    )) as { details: { modelId: string } };

    expect(mocks.resolveAgentReviewModel).toHaveBeenCalledWith(
      expect.anything(),
      configuredModel.canonicalId,
    );
    expect(mocks.prepareAgentReviewPlan).toHaveBeenCalledWith(
      expect.objectContaining({ model: configuredModel }),
    );
    expect(result.details.modelId).toBe(configuredModel.canonicalId);
  });

  it("rejects a configured model that is no longer scoped", async () => {
    mocks.loadReviewConfig.mockReturnValue({ agentModel: "openai/missing" });
    mocks.resolveAgentReviewModel.mockReturnValue(undefined);
    const pi = createPiMock();
    registerAgentReviewTools(pi as unknown as ExtensionAPI);

    await expect(
      getTool(pi, "supi_review_prepare").execute(
        "prepare-missing-model",
        {},
        undefined,
        undefined,
        toolContext(),
      ),
    ).rejects.toThrow('Configured agent review model "openai/missing" is not available');
    expect(mocks.prepareAgentReviewPlan).not.toHaveBeenCalled();
  });
});
