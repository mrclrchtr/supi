import type { AgentRunProgress } from "@mrclrchtr/supi-agent-runtime/api";
import { describe, expect, it, vi } from "vitest";
import {
  type ActiveRunRegistration,
  AgentRunRegistry,
  type BatchTaskResult,
  type CompletedBatch,
} from "../../src/tool/agent_run/registry.ts";
import type { AgentRunTranscriptCapture } from "../../src/tool/agent_run/transcript-store.ts";

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
    taskMetadata: { instructions: "Inspect the code" },
    handle,
    getConversationView: () => ({
      taskId,
      profileId: "explore",
      entries: [],
      omittedEntryCount: 0,
      omittedCharacterCount: 0,
      textTruncated: false,
      taskMetadata: { instructions: "Inspect the code" },
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
    registry.beginBatch("Shared");
    registry.register(makeRegistration("t1"));

    expect(registry.snapshot().activeSharedContext).toBe("Shared");
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

  it("retains every batch with distinct run keys and transcripts until shutdown", async () => {
    const registry = new AgentRunRegistry();
    const captures: AgentRunTranscriptCapture[] = [];
    const batches: CompletedBatch[] = [];
    for (const index of [1, 2]) {
      const batchId = registry.beginBatch();
      const runKey = `run-${index}`;
      const transcript = registry.createTranscriptCapture(
        {
          runKey,
          batchId,
          taskId: "same-task",
          profileId: "explore",
          cwd: "/work/project",
          modelId: "test/model",
          thinkingLevel: "low",
          tools: ["read"],
          instructions: "Inspect this file.",
          startedAt: index,
        },
        "Child system prompt",
      );
      captures.push(transcript);
      registry.register({
        ...makeRegistration("same-task"),
        runKey,
        batchId,
        transcript,
      });
      await transcript.finish();
      batches.push(
        registry.completeBatch(
          [makeResult({ taskId: "same-task" })],
          undefined,
          undefined,
          batchId,
        ),
      );
    }

    expect(registry.snapshot().batches).toHaveLength(2);
    expect(batches[0]?.runKeys["same-task"]).toBe("run-1");
    expect(batches[1]?.runKeys["same-task"]).toBe("run-2");
    expect(batches[0]?.transcriptSources["run-1"]).toBe(captures[0]);
    expect(batches[1]?.transcriptSources["run-2"]).toBe(captures[1]);
    await registry.clear();
  });

  it("does not restore a batch that completes after session cleanup", async () => {
    const registry = new AgentRunRegistry();
    const batchId = registry.beginBatch();
    registry.register({ ...makeRegistration("t1"), runKey: "run-1", batchId });

    await registry.cancelAll();
    await registry.clear();
    registry.completeBatch([makeResult()], undefined, undefined, batchId);

    expect(registry.snapshot()).toEqual({ activeRuns: [], batches: [], lastBatch: undefined });
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

  it("clears state and notifies subscribers on shutdown", async () => {
    const registry = new AgentRunRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    registry.register(makeRegistration("t1"));
    await registry.clear();

    expect(registry.hasActive()).toBe(false);
    expect(registry.lastBatch()).toBeUndefined();
    expect(listener).toHaveBeenLastCalledWith({
      activeRuns: [],
      batches: [],
      lastBatch: undefined,
    });
  });
});
