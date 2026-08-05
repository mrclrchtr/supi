import { describe, expect, it } from "vitest";
import { AgentRunRegistry, type BatchTaskResult } from "../../src/tool/registry.ts";

function makeHandle(): {
  result: Promise<never>;
  subscribe: () => () => void;
  steer: () => Promise<"not-running">;
  stop: () => Promise<void>;
} {
  return {
    result: new Promise(() => undefined),
    subscribe: () => () => undefined,
    steer: async () => "not-running",
    stop: async () => undefined,
  };
}

function makeResult(overrides: Partial<BatchTaskResult> = {}): BatchTaskResult {
  return {
    taskId: "t1",
    profileId: "explore",
    status: "completed",
    turns: 3,
    toolUses: 5,
    humanTruncated: false,
    modelTruncated: false,
    ...overrides,
  };
}

describe("AgentRunRegistry", () => {
  it("registers and tracks active runs", () => {
    const registry = new AgentRunRegistry();
    registry.register("t1", makeHandle() as never);
    expect(registry.hasActive()).toBe(true);
  });

  it("settles runs and tracks the last completed batch", () => {
    const registry = new AgentRunRegistry();
    registry.register("t1", makeHandle() as never);
    registry.settle("t1");
    const result = makeResult();
    const batch = registry.completeBatch([result], "shared");
    expect(batch.tasks).toHaveLength(1);
    expect(batch.tasks[0].taskId).toBe("t1");
    expect(batch.conversationViews).toEqual({});
    expect(registry.lastBatch()).toBe(batch);
    expect(registry.hasActive()).toBe(false);
  });

  it("clears state on shutdown", () => {
    const registry = new AgentRunRegistry();
    registry.register("t1", makeHandle() as never);
    registry.clear();
    expect(registry.hasActive()).toBe(false);
    expect(registry.lastBatch()).toBeUndefined();
  });
});
