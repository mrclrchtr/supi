import { afterEach, describe, expect, it, vi } from "vitest";

const fileSystem = vi.hoisted(() => {
  const files = new Map<string, string>();
  let pauseNextMessage = false;
  let releaseMessage: (() => void) | undefined;
  let onPartialMessage: (() => void) | undefined;

  return {
    files,
    pauseNextMessageWrite: () => {
      pauseNextMessage = true;
    },
    onPartialMessage: (handler: () => void) => {
      onPartialMessage = handler;
    },
    releaseMessageWrite: () => releaseMessage?.(),
    appendFile: vi.fn(async (path: string, data: string) => {
      const record = String(data);
      if (pauseNextMessage && record.includes('"kind":"message"')) {
        pauseNextMessage = false;
        const split = Math.max(1, Math.floor(record.length / 2));
        files.set(path, `${files.get(path) ?? ""}${record.slice(0, split)}`);
        onPartialMessage?.();
        await new Promise<void>((resolve) => {
          releaseMessage = resolve;
        });
        files.set(path, `${files.get(path) ?? ""}${record.slice(split)}`);
        return;
      }
      files.set(path, `${files.get(path) ?? ""}${record}`);
    }),
    mkdtemp: vi.fn(async () => "/virtual/supi-agent-transcripts"),
    readFile: vi.fn(async (path: string) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const content = files.get(path);
      if (content === undefined) throw new Error("Transcript file is missing.");
      return content;
    }),
    rm: vi.fn(async () => {
      files.clear();
    }),
  };
});

vi.mock("node:fs/promises", () => ({
  appendFile: fileSystem.appendFile,
  mkdtemp: fileSystem.mkdtemp,
  readFile: fileSystem.readFile,
  rm: fileSystem.rm,
}));

import { AgentRunTranscriptStore } from "../../src/tool/agent_run/transcript-store.js";

const stores: AgentRunTranscriptStore[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.dispose()));
});

describe("AgentRunTranscriptCapture concurrent reads", () => {
  it("keeps a transcript read from overlapping a later append", async () => {
    const store = new AgentRunTranscriptStore();
    stores.push(store);
    const capture = store.createCapture(
      {
        runKey: "run-1",
        batchId: "batch-1",
        taskId: "task-1",
        profileId: "coder",
        cwd: "/work/project",
        modelId: "provider/model",
        thinkingLevel: "high",
        tools: [],
        instructions: "Inspect the source.",
        startedAt: 1,
      },
      "Child system prompt",
      [],
    );
    await capture.load();

    const partialMessage = new Promise<void>((resolve) => {
      fileSystem.onPartialMessage(resolve);
    });
    fileSystem.pauseNextMessageWrite();
    const loading = capture.load();
    capture.observe(
      {
        type: "message_end",
        message: { role: "user", content: "A complete transcript message." },
      } as never,
      "Child system prompt",
      [],
    );

    const firstRead = await loading;
    await partialMessage;
    fileSystem.releaseMessageWrite();
    await capture.finish();
    const finalDocument = await capture.load();

    expect(firstRead.status).not.toBe("incomplete");
    expect(finalDocument.status).toBe("complete");
    expect(finalDocument.messages).toHaveLength(1);
  });
});
