import { describe, expect, it, vi } from "vitest";
import { AgentRunRegistry } from "../../src/session/agent-run-registry.ts";
import type { AgentRunDisplayMetadata } from "../../src/session/agent-run-registry-types.ts";
import type {
  AgentRunHandle,
  AgentRunOutcome,
  AgentRunProgress,
  AgentRunSessionView,
} from "../../src/types.ts";

function makeHandle(
  options: {
    status?: AgentRunProgress["status"];
    steering?: boolean;
    steerResult?: "queued" | "handled";
  } = {},
) {
  let resolve!: (outcome: AgentRunOutcome<string>) => void;
  const result = new Promise<AgentRunOutcome<string>>((done) => {
    resolve = done;
  });
  const progress: AgentRunProgress = {
    status: options.status ?? "running",
    turns: 2,
    toolUses: 3,
    toolErrors: 0,
  };
  const stop = vi.fn(async () => undefined);
  const steer = vi.fn(async () => options.steerResult ?? "queued");
  const unsubscribeProgress = vi.fn();
  const handle: AgentRunHandle<string> = {
    steeringAvailable: options.steering ?? true,
    result,
    subscribe(listener) {
      listener(progress);
      return unsubscribeProgress;
    },
    steer,
    stop,
  };
  return { handle, resolve, stop, steer, unsubscribeProgress };
}

function metadata(
  runKey: string,
  batchId = "batch-1",
): AgentRunDisplayMetadata & { runKey: string; batchId: string } {
  return {
    runKey,
    batchId,
    taskId: runKey,
    kind: "Reviewer",
    label: "state review",
    cwd: "/workspace",
    modelId: "test/model",
    thinkingLevel: "low",
    tools: ["read", "submit_review"],
    startedAt: 1,
  };
}

describe("Agent Run Registry", () => {
  it("shows Agent and Reviewer runs in one session-local list", () => {
    const registry = new AgentRunRegistry();
    const agent = makeHandle();
    const reviewer = makeHandle();
    registry.register({
      metadata: { ...metadata("agent"), kind: "Agent Run", label: "explore" },
      handle: agent.handle,
    });
    registry.register({ metadata: metadata("reviewer"), handle: reviewer.handle });

    expect(registry.snapshot().runs.map(({ kind, taskId }) => [kind, taskId])).toEqual([
      ["Agent Run", "agent"],
      ["Reviewer", "reviewer"],
    ]);
  });

  it("admits steering only when the runtime reports initial-prompt availability", async () => {
    const registry = new AgentRunRegistry();
    const prompting = makeHandle({ steering: true });
    const recovering = makeHandle({ steering: false });
    registry.register({ metadata: metadata("prompting"), handle: prompting.handle });
    registry.register({ metadata: metadata("recovering"), handle: recovering.handle });

    await expect(registry.steer("prompting", "Check the test path")).resolves.toBe("queued");
    await expect(registry.steer("recovering", "Change the review criteria")).resolves.toBe(
      "not-running",
    );
    expect(prompting.steer).toHaveBeenCalledWith("Check the test path");
    expect(recovering.steer).not.toHaveBeenCalled();
    expect(
      registry.snapshot().runs.find((run) => run.runKey === "recovering")?.steeringAvailable,
    ).toBe(false);
  });

  it("returns handled input without recording it as queued steering", async () => {
    const registry = new AgentRunRegistry();
    const handled = makeHandle({ steerResult: "handled" });
    const getConversation = vi.fn((queuedSteering: readonly string[]) => ({
      entries: queuedSteering.map((text) => ({ kind: "steering" as const, text })),
      omittedEntryCount: 0,
      omittedCharacterCount: 0,
      textTruncated: false,
    }));
    registry.register({
      metadata: metadata("handled-steering"),
      handle: handled.handle,
      getConversation,
    });

    await expect(registry.steer("handled-steering", "Open the help command")).resolves.toBe(
      "handled",
    );

    expect(registry.queuedSteering("handled-steering")).toEqual([]);
    registry.snapshot();
    expect(getConversation).toHaveBeenLastCalledWith([]);
  });

  it("stops only the selected run and leaves sibling reviewers active", async () => {
    const registry = new AgentRunRegistry();
    const selected = makeHandle();
    const sibling = makeHandle();
    registry.register({ metadata: metadata("selected"), handle: selected.handle });
    registry.register({ metadata: metadata("sibling"), handle: sibling.handle });

    await expect(registry.stop("selected")).resolves.toBe("accepted");

    expect(selected.stop).toHaveBeenCalledOnce();
    expect(sibling.stop).not.toHaveBeenCalled();
    expect(registry.snapshot().runs.find((run) => run.runKey === "sibling")?.active).toBe(true);
  });

  it("releases live run state at settlement and retains the display and transcript snapshot", async () => {
    const registry = new AgentRunRegistry();
    try {
      const run = makeHandle();
      const runMetadata = metadata("completed");
      const transcript = registry.createTranscriptCapture(runMetadata, "Agent Protocol");
      const conversation = {
        entries: [{ kind: "assistant" as const, text: "Finished." }],
        omittedEntryCount: 0,
        omittedCharacterCount: 0,
        textTruncated: false,
      };
      const getConversation = vi.fn(() => conversation);
      const getRecentActivity = vi.fn(() => ["tool:read"]);
      registry.register({
        metadata: runMetadata,
        transcript,
        handle: run.handle,
        getConversation,
        getRecentActivity,
      });
      let sessionListener: ((event: never) => void) | undefined;
      const unsubscribeSession = vi.fn(() => {
        sessionListener = undefined;
      });
      const session = {
        systemPrompt: "Agent Protocol",
        getToolRenderers: () => [],
        subscribe: (listener: (event: never) => void) => {
          sessionListener = listener;
          return unsubscribeSession;
        },
      } as unknown as AgentRunSessionView;
      registry.attachSession("completed", session);
      sessionListener?.({
        type: "message_end",
        message: { role: "assistant", content: [{ type: "text", text: "Finished." }] },
      } as never);
      const callsBeforeSettlement = getConversation.mock.calls.length;

      run.resolve({ kind: "success", value: "Finished." });
      await run.handle.result;

      expect(run.unsubscribeProgress).toHaveBeenCalledOnce();
      expect(unsubscribeSession).toHaveBeenCalledOnce();
      expect(getConversation).toHaveBeenCalledTimes(callsBeforeSettlement + 1);
      expect(getRecentActivity).toHaveBeenCalledOnce();
      expect(registry.hasActive()).toBe(false);
      await expect(registry.stop("completed")).resolves.toBe("not-running");
      await expect(registry.steer("completed", "late steering")).resolves.toBe("not-running");
      expect(run.stop).not.toHaveBeenCalled();
      expect(run.steer).not.toHaveBeenCalled();

      registry.setDisplayResult("completed", { finalText: "Finished." });
      const saved = registry.snapshot().runs[0];
      expect(saved).toMatchObject({
        active: false,
        status: "completed",
        recentActivity: ["tool:read"],
        conversation,
        result: { finalText: "Finished." },
        transcriptSource: transcript,
      });
      expect(getConversation).toHaveBeenCalledTimes(callsBeforeSettlement + 1);
      expect(getRecentActivity).toHaveBeenCalledOnce();

      await transcript.finish();
      await expect(transcript.load()).resolves.toMatchObject({
        status: "complete",
        messages: [{ role: "assistant" }],
      });
    } finally {
      await registry.clear();
    }
  });

  it("releases steering records after the final snapshot and ignores late steering", async () => {
    const registry = new AgentRunRegistry();
    const run = makeHandle();
    const getConversation = vi.fn((queuedSteering: readonly string[]) => ({
      entries: queuedSteering.map((text) => ({ kind: "steering" as const, text })),
      omittedEntryCount: 0,
      omittedCharacterCount: 0,
      textTruncated: false,
    }));
    registry.register({
      metadata: metadata("steering-race"),
      handle: run.handle,
      getConversation,
    });
    await registry.steer("steering-race", "First steering");

    let acceptLateSteering!: () => void;
    run.steer.mockImplementationOnce(
      () =>
        new Promise<"queued">((resolve) => {
          acceptLateSteering = () => resolve("queued");
        }),
    );
    const lateSteering = registry.steer("steering-race", "Late steering");

    run.resolve({ kind: "success", value: "Done" });
    await run.handle.result;
    expect(getConversation).toHaveBeenLastCalledWith(["First steering"]);
    expect(registry.queuedSteering("steering-race")).toEqual([]);

    acceptLateSteering();
    await expect(lateSteering).resolves.toBe("queued");
    expect(registry.queuedSteering("steering-race")).toEqual([]);
    expect(registry.snapshot().runs[0]?.conversation?.entries).toEqual([
      { kind: "steering", text: "First steering" },
    ]);
  });

  it("captures a reviewer session transcript and removes it on lifecycle reset", async () => {
    const registry = new AgentRunRegistry();
    const run = makeHandle();
    const runMetadata = metadata("reviewer");
    const transcript = registry.createTranscriptCapture(runMetadata, "Reviewer Protocol");
    registry.register({ metadata: runMetadata, transcript, handle: run.handle });
    let observer: ((event: { type: string; message: unknown }) => void) | undefined;
    const session = {
      systemPrompt: "Reviewer Protocol",
      getToolRenderers: () => [],
      subscribe: (listener: typeof observer) => {
        observer = listener;
        return () => undefined;
      },
    } as unknown as AgentRunSessionView;
    registry.attachSession("reviewer", session);
    observer?.({
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: "Review is complete." }] },
    });
    await transcript.finish();

    await expect(transcript.load()).resolves.toMatchObject({
      metadata: { kind: "Reviewer", taskId: "reviewer" },
      systemPrompt: "Reviewer Protocol",
      messages: [{ role: "assistant" }],
    });

    await registry.clear();
    expect(run.stop).toHaveBeenCalledOnce();
    expect(registry.snapshot()).toEqual({ runs: [] });
    await expect(transcript.load()).resolves.toMatchObject({ status: "incomplete" });
  });

  it("does not restore old runs after a session reset", async () => {
    const registry = new AgentRunRegistry();
    const oldRun = makeHandle();
    registry.register({ metadata: metadata("old"), handle: oldRun.handle });
    await registry.clear();
    registry.openSession();
    const currentRun = makeHandle();
    registry.register({ metadata: metadata("current"), handle: currentRun.handle });
    oldRun.resolve({ kind: "success", value: "late" });
    await Promise.resolve();

    expect(registry.snapshot().runs.map((run) => run.runKey)).toEqual(["current"]);
  });
});
