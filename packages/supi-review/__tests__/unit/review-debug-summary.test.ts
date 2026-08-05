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
  targetKind: "current-state",
  targetTitle: "Current state audit",
  packetBytes: 1234,
  durationMs: 42_000,
  reviewerExtensionSetStatus: "active" as const,
  progress: {
    turns: 3,
    toolUses: 12,
    toolErrors: 1,
    tokens: { input: 100, output: 50, total: 150, cacheRead: 300, cacheWrite: 10 },
  },
};

// biome-ignore lint/security/noSecrets: function name under test, not a secret
describe("recordReviewTaskDebugSummary", () => {
  afterEach(() => resetDebugRegistry());

  it("records compact trustworthy lifecycle metrics when debugging is enabled", () => {
    configureDebugRegistry({ enabled: true });

    recordReviewTaskDebugSummary({ ...input, result: completedResult });

    const { events } = getDebugEvents({ source: "supi-review" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: "supi-review",
      level: "info",
      category: "review-task",
      message: "Review task spec pass",
    });
    expect(events[0].data).toEqual({
      taskId: "spec",
      targetKind: "current-state",
      targetTitle: "Current state audit",
      modelId: "provider/model",
      packetBytes: 1234,
      durationMs: 42_000,
      status: "completed",
      reviewerExtensionSetStatus: "active",
      verdict: "pass",
      turns: 3,
      toolUses: 12,
      toolErrors: 1,
      usage: { input: 100, output: 50, total: 150, cacheRead: 300, cacheWrite: 10 },
      cacheHitRate: 75,
    });
  });

  it("omits cache hit rate when the provider reports no cache metrics", () => {
    configureDebugRegistry({ enabled: true });

    recordReviewTaskDebugSummary({
      ...input,
      progress: {
        ...input.progress,
        tokens: { input: 100, output: 50, total: 150, cacheRead: 0, cacheWrite: 0 },
      },
      result: completedResult,
    });

    expect(getDebugEvents({ source: "supi-review" }).events[0]?.data).not.toHaveProperty(
      "cacheHitRate",
    );
  });

  it("marks failed tasks as warnings with failure diagnostics metadata", () => {
    configureDebugRegistry({ enabled: true });
    const failed: ReviewTaskResult = {
      taskId: "spec",
      packetHash: "h".repeat(64),
      modelId: "provider/model",
      status: "failed",
      failureCode: "missing-structured-output",
      diagnostics: {
        lifecycleTrace: { entries: [], droppedCount: 0 },
        turns: 2,
        toolUses: 4,
      },
    };

    recordReviewTaskDebugSummary({
      taskId: "spec",
      targetKind: "working-tree",
      targetTitle: "Working tree changes",
      packetBytes: 900,
      durationMs: 10_000,
      reviewerExtensionSetStatus: "unobserved",
      result: failed,
    });

    const { events } = getDebugEvents({ source: "supi-review" });
    expect(events[0]).toMatchObject({
      level: "warning",
      message: "Review task spec failed",
      data: expect.objectContaining({
        status: "failed",
        reviewerExtensionSetStatus: "unobserved",
        failureCode: "missing-structured-output",
        turns: 2,
        toolUses: 4,
        toolErrors: 0,
      }),
    });
  });

  it("records nothing while the debug registry is disabled", () => {
    recordReviewTaskDebugSummary({ ...input, result: completedResult });

    expect(getDebugEvents({ source: "supi-review" }).events).toHaveLength(0);
  });
});
