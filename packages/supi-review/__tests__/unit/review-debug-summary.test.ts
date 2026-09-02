import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, describe, expect, it } from "vitest";
import { recordReviewTaskDebugSummary } from "../../src/tool/review_run/debug-summary.ts";
import type { ReviewTaskResult } from "../../src/types.ts";

const completedResult: ReviewTaskResult = {
  taskId: "spec",
  mode: "state",
  packetHash: "h".repeat(64),
  modelId: "provider/model",
  requestedThinkingLevel: "max",
  effectiveThinkingLevel: "high",
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
    tokens: { input: 100, output: 50, total: 150, reasoning: 25 },
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
      data: expect.objectContaining({
        taskId: "spec",
        mode: "state",
        verdict: "pass",
        requestedThinkingLevel: "max",
        effectiveThinkingLevel: "high",
        usage: expect.objectContaining({ reasoning: 25 }),
      }),
    });
  });

  it("uses final result usage when progress has no usage", () => {
    configureDebugRegistry({ enabled: true });
    const result: ReviewTaskResult = {
      ...completedResult,
      usage: {
        input: 100,
        output: 50,
        cacheRead: 200,
        cacheWrite: 0,
        totalTokens: 350,
        reasoning: 25,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    };
    recordReviewTaskDebugSummary({
      ...input,
      progress: { turns: 3, toolUses: 12, toolErrors: 1 },
      result,
    });

    expect(getDebugEvents({ source: "supi-review" }).events[0]).toMatchObject({
      data: expect.objectContaining({
        usage: {
          input: 100,
          output: 50,
          total: 350,
          cacheRead: 200,
          cacheWrite: 0,
          reasoning: 25,
        },
      }),
    });
  });

  it("supplements observed usage with final reasoning", () => {
    configureDebugRegistry({ enabled: true });
    const result: ReviewTaskResult = {
      ...completedResult,
      usage: {
        input: 200,
        output: 100,
        cacheRead: 400,
        cacheWrite: 0,
        totalTokens: 700,
        reasoning: 25,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    };
    recordReviewTaskDebugSummary({
      ...input,
      progress: {
        turns: 3,
        toolUses: 12,
        toolErrors: 1,
        tokens: { input: 100, output: 50, total: 150, cacheRead: 200, cacheWrite: 0 },
      },
      result,
    });

    expect(getDebugEvents({ source: "supi-review" }).events[0]).toMatchObject({
      data: expect.objectContaining({
        usage: { input: 100, output: 50, total: 150, cacheRead: 200, cacheWrite: 0, reasoning: 25 },
      }),
    });
  });

  it("marks failed tasks as warnings", () => {
    configureDebugRegistry({ enabled: true });
    const failed: ReviewTaskResult = {
      taskId: "spec",
      mode: "change",
      packetHash: "h".repeat(64),
      modelId: "provider/model",
      requestedThinkingLevel: "max",
      effectiveThinkingLevel: "max",
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
