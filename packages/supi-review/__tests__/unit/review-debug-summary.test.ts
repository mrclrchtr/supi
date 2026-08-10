import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, describe, expect, it } from "vitest";
import { recordReviewTaskDebugSummary } from "../../src/tool/review-debug-summary.ts";
import type { ReviewTaskResult } from "../../src/types.ts";

const completedResult: ReviewTaskResult = {
  taskId: "spec",
  mode: "state",
  packetHash: "h".repeat(64),
  modelId: "provider/model",
  status: "completed",
  verdict: "pass",
  findingCounts: {
    total: 0,
    blocking: 0,
    nonBlocking: 0,
    byImpact: { low: 0, medium: 0, high: 0 },
  },
  summary: "Clean.",
  findings: [],
  criteriaCoverage: { status: "complete" },
};

const input = {
  taskId: "spec",
  mode: "state" as const,
  targetTitle: "Current filesystem",
  packetBytes: 1234,
  durationMs: 42_000,
  reviewerExtensionSetStatus: "active" as const,
  progress: {
    turns: 3,
    toolUses: 12,
    toolErrors: 1,
    tokens: { input: 100, output: 50, total: 150 },
  },
};

// biome-ignore lint/security/noSecrets: Function name under test.
describe("recordReviewTaskDebugSummary", () => {
  afterEach(() => resetDebugRegistry());

  it("records compact task mode and lifecycle metrics", () => {
    configureDebugRegistry({ enabled: true });
    recordReviewTaskDebugSummary({ ...input, result: completedResult });

    expect(getDebugEvents({ source: "supi-review" }).events[0]).toMatchObject({
      source: "supi-review",
      category: "review-task",
      data: expect.objectContaining({ taskId: "spec", mode: "state", verdict: "pass" }),
    });
  });

  it("marks failed tasks as warnings", () => {
    configureDebugRegistry({ enabled: true });
    const failed: ReviewTaskResult = {
      taskId: "spec",
      mode: "change",
      packetHash: "h".repeat(64),
      modelId: "provider/model",
      status: "failed",
      failureCode: "missing-structured-output",
      diagnostics: { lifecycleTrace: { entries: [], droppedCount: 0 }, turns: 2, toolUses: 4 },
    };
    recordReviewTaskDebugSummary({ ...input, mode: "change", result: failed });

    expect(getDebugEvents({ source: "supi-review" }).events[0]).toMatchObject({
      level: "warning",
      data: expect.objectContaining({ mode: "change", failureCode: "missing-structured-output" }),
    });
  });
});
