import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentRunTranscriptStore } from "../../src/tool/agent_run/transcript-store.js";

const stores: AgentRunTranscriptStore[] = [];

function createStore(): AgentRunTranscriptStore {
  const store = new AgentRunTranscriptStore();
  stores.push(store);
  return store;
}

function metadata() {
  return {
    runKey: "run-1",
    batchId: "batch-1",
    taskId: "task-1",
    profileId: "coder",
    cwd: "/work/project",
    modelId: "provider/model",
    thinkingLevel: "high",
    tools: ["read"],
    instructions: "Inspect the source.",
    sharedContext: "Use the existing package API.",
    startedAt: 1,
  };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(stores.splice(0).map((store) => store.dispose()));
});

describe("AgentRunTranscriptStore", () => {
  it("refreshes the viewer for lifecycle events without a new message", async () => {
    const onChange = vi.fn();
    const capture = createStore().createCapture(metadata(), "Child system prompt", [], onChange);
    capture.observe({ type: "turn_start" } as never, "Child system prompt", []);

    const document = await capture.load();

    expect(document.operations).toEqual([expect.objectContaining({ type: "turn_start" })]);
    expect(onChange).toHaveBeenCalled();
  });

  it("stores every finalized message and only allowlisted lifecycle metadata", async () => {
    const execute = vi.fn();
    const renderCall = vi.fn();
    const capture = createStore().createCapture(metadata(), "Child system prompt", [
      { name: "read", execute, renderCall } as never,
    ]);
    const userMessage = { role: "user", content: "Inspect this file.", timestamp: 1 };
    const toolMessage = {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "read",
      content: [{ type: "text", text: "file contents" }],
      details: { raw: true, authorization: "transport secret" },
      providerMetadata: { debug: "provider payload" },
      providerDebug: { request: "private payload" },
      requestHeaders: { authorization: "transport secret" },
      apiSecret: "transport secret",
      providerAuth: "transport secret",
      isError: false,
      timestamp: 2,
    };
    capture.observe(
      {
        type: "tool_execution_start",
        toolCallId: "call-1",
        toolName: "read",
        args: { path: "src/index.ts" },
      } as never,
      "Child system prompt",
      [{ name: "read", execute, renderCall } as never],
    );
    capture.observe({ type: "message_end", message: userMessage } as never, "Child system prompt", [
      { name: "read", execute, renderCall } as never,
    ]);
    capture.observe(
      { type: "message_end", message: toolMessage } as never,
      "Updated child prompt",
      [{ name: "read", execute, renderCall } as never],
    );
    capture.observe(
      {
        type: "auto_retry_start",
        attempt: 2,
        maxAttempts: 4,
        delayMs: 500,
        error: "transport secret",
      } as never,
      "Updated child prompt",
      [{ name: "read", execute, renderCall } as never],
    );
    await capture.finish();

    const document = await capture.load();
    expect(document.metadata).toMatchObject({ taskId: "task-1", modelId: "provider/model" });
    expect(document.systemPrompt).toBe("Updated child prompt");
    expect(document.systemPromptHistory.map(({ text }) => text)).toEqual([
      "Child system prompt",
      "Updated child prompt",
    ]);
    expect(document.messages[0]).toEqual(userMessage);
    expect(document.messages[1]).toMatchObject({
      role: "toolResult",
      content: [{ type: "text", text: "file contents" }],
      details: { raw: true },
    });
    expect(document.messages[1]).not.toHaveProperty("providerMetadata");
    expect(document.messages[1]).not.toHaveProperty("providerDebug");
    expect(document.messages[1]).not.toHaveProperty("requestHeaders");
    expect(document.messages[1]).not.toHaveProperty("apiSecret");
    expect(document.messages[1]).not.toHaveProperty("providerAuth");
    expect(document.messages[1]).not.toHaveProperty("details.authorization");
    expect(document.operations).toEqual([
      expect.objectContaining({
        type: "tool_execution_start",
        toolName: "read",
        toolCallId: "call-1",
      }),
      expect.objectContaining({
        type: "auto_retry_start",
        attempt: 2,
        maxAttempts: 4,
        delayMs: 500,
      }),
    ]);
    expect(JSON.stringify(document)).not.toContain("transport secret");
    expect(capture.toolRenderers).toEqual([{ name: "read", renderCall }]);
    expect(capture.toolRenderers[0]).not.toHaveProperty("execute");
    expect(document.status).toBe("complete");
    expect(document.messageCount).toBe(2);
  });

  it("stores the safe result from a completed compaction", async () => {
    const capture = createStore().createCapture(metadata(), "Child system prompt", []);
    capture.observe(
      {
        type: "compaction_end",
        reason: "threshold",
        aborted: false,
        willRetry: false,
        result: {
          summary: "The run changed the parser.",
          firstKeptEntryId: "entry-7",
          tokensBefore: 12_000,
          estimatedTokensAfter: 4_500,
          usage: { input: 200, output: 100, totalTokens: 300 },
          details: {
            readFiles: ["src/parser.ts"],
            apiSecret: "secret value",
          },
        },
      } as never,
      "Child system prompt",
      [],
    );
    await capture.finish();

    const operation = (await capture.load()).operations[0];
    expect(operation).toMatchObject({
      type: "compaction_end",
      summary: "The run changed the parser.",
      firstKeptEntryId: "entry-7",
      tokensBefore: 12_000,
      estimatedTokensAfter: 4_500,
      usage: { input: 200, output: 100, totalTokens: 300 },
      details: { readFiles: ["src/parser.ts"] },
    });
    expect(JSON.stringify(operation)).not.toContain("secret value");
  });

  it("removes temporary transcript files when the store is disposed", async () => {
    const parent = await mkdtemp(join(tmpdir(), "supi-transcript-cleanup-"));
    vi.stubEnv("TMPDIR", parent);
    const store = createStore();
    try {
      const capture = store.createCapture(metadata(), "Child system prompt", []);
      capture.observe(
        { type: "message_end", message: { role: "user", content: "Inspect this file." } } as never,
        "Child system prompt",
        [],
      );
      await capture.finish();

      const [sessionDirectory] = await readdir(parent);
      expect(sessionDirectory).toBeDefined();
      const files = await readdir(join(parent, sessionDirectory ?? ""));
      expect(files).toHaveLength(1);
      await store.dispose();
      expect(await readdir(parent)).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      await store.dispose();
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("reports incomplete capture and returns the available prompt when temporary storage fails", async () => {
    const missingParent = join(tmpdir(), `supi-missing-${Date.now()}`);
    vi.stubEnv("TMPDIR", join(missingParent, "nested"));
    const capture = createStore().createCapture(metadata(), "Available child prompt", []);
    capture.observe(
      {
        type: "message_end",
        message: { role: "user", content: "not stored", timestamp: 1 },
      } as never,
      "Available child prompt",
      [],
    );
    await capture.finish();

    expect(capture.getStatus().status).toBe("incomplete");
    const document = await capture.load();
    expect(document.status).toBe("incomplete");
    expect(document.systemPrompt).toBe("Available child prompt");
    expect(document.messages).toEqual([]);
    await rm(missingParent, { recursive: true, force: true });
  });
});
