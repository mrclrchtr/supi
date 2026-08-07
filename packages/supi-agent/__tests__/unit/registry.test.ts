import type { AgentRunProgress } from "@mrclrchtr/supi-agent-runtime/api";
import { describe, expect, it, vi } from "vitest";
import {
  type ActiveRunRegistration,
  AgentRunRegistry,
  type BatchTaskResult,
} from "../../src/tool/registry.ts";

function makeHandle(status: AgentRunProgress["status"] = "running") {
  return {
    result: new Promise<never>(() => undefined),
    subscribe: vi.fn((listener: (progress: AgentRunProgress) => void) => {
      listener({ status, turns: 2, toolUses: 3, toolErrors: 0 });
      return () => undefined;
    }),
    steer: vi.fn(async () => "accepted" as const),
    stop: vi.fn(async () => undefined),
  };
}

function makeRegistration(taskId: string, handle = makeHandle()): ActiveRunRegistration {
  return {
    taskId,
    profileId: "explore",
    modelId: "test/model",
    thinkingLevel: "medium",
    taskMetadata: { instructions: "Inspect the code", sharedContext: "Shared" },
    handle,
    getConversationView: () => ({
      taskId,
      profileId: "explore",
      entries: [],
      omittedEntryCount: 0,
      omittedCharacterCount: 0,
      textTruncated: false,
      taskMetadata: { instructions: "Inspect the code", sharedContext: "Shared" },
    }),
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
  it("exposes active run metadata and progress", () => {
    const registry = new AgentRunRegistry();
    registry.register(makeRegistration("t1"));

    expect(registry.snapshot().activeRuns).toMatchObject([
      {
        taskId: "t1",
        profileId: "explore",
        modelId: "test/model",
        thinkingLevel: "medium",
        status: "running",
        turns: 2,
        toolUses: 3,
      },
    ]);
  });

  it("builds live Conversation Views only while an overlay subscribes", () => {
    const registry = new AgentRunRegistry();
    const registration = makeRegistration("t1");
    registration.getConversationView = vi.fn(registration.getConversationView);

    registry.register(registration);
    expect(registration.getConversationView).not.toHaveBeenCalled();

    const unsubscribe = registry.subscribe(() => undefined);
    expect(registration.getConversationView).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("steers only a running selected run and retains the accepted entry", async () => {
    const registry = new AgentRunRegistry();
    const running = makeHandle();
    const starting = makeHandle("starting");
    registry.register(makeRegistration("running", running));
    registry.register(makeRegistration("starting", starting));

    await expect(registry.steer("running", "Focus on tests")).resolves.toBe("accepted");
    await expect(registry.steer("starting", "Too early")).resolves.toBe("not-running");

    expect(running.steer).toHaveBeenCalledWith("Focus on tests");
    expect(starting.steer).not.toHaveBeenCalled();
    expect(registry.acceptedSteering("running")).toEqual(["Focus on tests"]);
  });

  it("stops only the selected non-terminal run", async () => {
    const registry = new AgentRunRegistry();
    const selected = makeHandle();
    const sibling = makeHandle();
    registry.register(makeRegistration("selected", selected));
    registry.register(makeRegistration("sibling", sibling));

    await expect(registry.stop("selected")).resolves.toBe("accepted");

    expect(selected.stop).toHaveBeenCalledOnce();
    expect(sibling.stop).not.toHaveBeenCalled();
  });

  it("settles runs and tracks the last completed batch", () => {
    const registry = new AgentRunRegistry();
    registry.register(makeRegistration("t1"));
    registry.settle("t1");
    const batch = registry.completeBatch([makeResult()], "shared");

    expect(batch.tasks[0]?.taskId).toBe("t1");
    expect(registry.snapshot()).toMatchObject({ activeRuns: [], lastBatch: batch });
  });

  it("isolates Conversation View and listener failures from Agent Run state", () => {
    const registry = new AgentRunRegistry();
    const registration = makeRegistration("t1");
    registration.getConversationView = () => {
      throw new Error("presentation failed");
    };

    expect(() =>
      registry.subscribe(() => {
        throw new Error("listener failed");
      }),
    ).not.toThrow();
    expect(() => registry.register(registration)).not.toThrow();
    expect(registry.snapshot().activeRuns[0]?.conversationView.entries).toEqual([]);
  });

  it("clears state and notifies subscribers on shutdown", () => {
    const registry = new AgentRunRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    registry.register(makeRegistration("t1"));
    registry.clear();

    expect(registry.hasActive()).toBe(false);
    expect(registry.lastBatch()).toBeUndefined();
    expect(listener).toHaveBeenLastCalledWith({ activeRuns: [], lastBatch: undefined });
  });
});
