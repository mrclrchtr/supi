import { initTheme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { AgentRunToolRenderer } from "@mrclrchtr/supi-agent-runtime/api";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  type AgentRunTranscriptDocument,
  type AgentRunTranscriptSource,
  AgentRunTranscriptStore,
} from "../../src/session/transcript-store.ts";
import { AgentsDialog } from "../../src/ui/agents-overlay.ts";
import type {
  AgentsDialogDependencies,
  AgentsOverlayData,
} from "../../src/ui/agents-overlay-data.ts";
import { makeAgentsRun } from "../helpers/agents-viewer-fixtures.ts";

const stores: AgentRunTranscriptStore[] = [];

beforeAll(() => initTheme());

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.dispose()));
});

function dependencies(rows: number): AgentsDialogDependencies {
  return {
    theme: makeCtx().ui.theme as never,
    done: vi.fn(),
    tui: { requestRender: vi.fn(), terminal: { rows } },
    onSteer: vi.fn(async () => "queued" as const),
    onStop: vi.fn(async () => "accepted" as const),
  };
}

function openConversation(dialog: AgentsDialog): void {
  dialog.handleInput("\n");
}

function click(dialog: AgentsDialog, x: number, y: number) {
  return dialog.handleMouse({
    type: "click",
    button: "left",
    x,
    y,
    screenX: x,
    screenY: y,
    width: 120,
    height: 80,
    shift: false,
    alt: false,
    ctrl: false,
  });
}

function fallbackData(transcriptSource: AgentRunTranscriptSource): AgentsOverlayData {
  const run = data().runs[0];
  if (!run) throw new Error("Missing test run");
  return data({
    runs: [
      {
        ...run,
        key: "run:run-1",
        runKey: "run-1",
        active: false,
        status: "completed",
        result: { finalText: "Available final result" },
        conversation: {
          entries: [{ kind: "assistant", text: "Retained conversation entry" }],
          omittedEntryCount: 0,
          omittedCharacterCount: 0,
          textTruncated: false,
        },
        transcriptSource,
      },
    ],
  });
}

function data(overrides: Partial<AgentsOverlayData> = {}): AgentsOverlayData {
  return {
    runs: [
      makeAgentsRun({
        modelId: "test/model",
        thinkingLevel: "high",
        turns: 1,
        toolUses: 1,
        ...overrides.runs?.[0],
      }),
    ],
    ...overrides,
  };
}

describe("AgentsDialog transcript viewer", () => {
  it("uses fullscreen mouse scroll to pause and follow the transcript", () => {
    const run = data().runs[0];
    if (!run) throw new Error("Missing test run");
    const dialog = new AgentsDialog(
      data({
        runs: [
          {
            ...run,
            conversation: {
              entries: Array.from({ length: 50 }, (_, index) => ({
                kind: "assistant" as const,
                text: `message ${index + 1}`,
              })),
              omittedEntryCount: 0,
              omittedCharacterCount: 0,
              textTruncated: false,
            },
          },
        ],
      }),
      dependencies(24),
    );
    openConversation(dialog);
    expect(dialog.render(120).join("\n")).toContain("message 50");

    const wheel = (wheelDelta: number) =>
      dialog.handleMouse({
        type: "wheel",
        button: "none",
        x: 50,
        y: 12,
        screenX: 50,
        screenY: 12,
        width: 120,
        height: 24,
        shift: false,
        alt: false,
        ctrl: false,
        wheelDelta,
      });
    expect(wheel(-4)).toEqual({ handled: true });
    expect(dialog.render(120).join("\n")).toContain("PAUSED");
    expect(dialog.render(120).join("\n")).not.toContain("message 50");

    wheel(20);
    expect(dialog.render(120).join("\n")).toContain("message 50");
    expect(dialog.render(120).join("\n")).toContain("LIVE");
    dialog.dispose();
  });

  it("shows the retained result and conversation when transcript loading fails", async () => {
    const source: AgentRunTranscriptSource = {
      runKey: "run-1",
      toolRenderers: [],
      getStatus: () => ({ status: "complete", revision: 1, messageCount: 0 }),
      load: async () => {
        throw new Error("storage unavailable");
      },
    };
    const dialog = new AgentsDialog(fallbackData(source), dependencies(40));
    openConversation(dialog);

    await vi.waitFor(() => {
      const rendered = dialog.render(120).join("\n");
      expect(rendered).toContain("Retained conversation entry");
    });
    expect(dialog.render(120).join("\n")).toContain("Transcript storage is unavailable");
    dialog.handleInput("\t");
    expect(dialog.render(120).join("\n")).toContain("Available final result");
    dialog.dispose();
  });

  it("shows the retained result and conversation with an empty incomplete transcript", async () => {
    const document: AgentRunTranscriptDocument = {
      metadata: {
        runKey: "run-1",
        batchId: "batch-1",
        taskId: "inspect",
        kind: "Agent Run",
        label: "explore",
        cwd: "/work/project",
        modelId: "test/model",
        thinkingLevel: "high",
        tools: [],
        taskDescription: "Inspect this file.",
        startedAt: 1,
      },
      systemPrompt: "",
      systemPromptHistory: [],
      messages: [],
      operations: [],
      status: "incomplete",
      messageCount: 0,
    };
    const source: AgentRunTranscriptSource = {
      runKey: "run-1",
      toolRenderers: [],
      getStatus: () => ({ status: "incomplete", revision: 1, messageCount: 0 }),
      load: async () => document,
    };
    const dialog = new AgentsDialog(fallbackData(source), dependencies(40));
    openConversation(dialog);

    await vi.waitFor(() => {
      const rendered = dialog.render(120).join("\n");
      expect(rendered).toContain("Retained conversation entry");
      expect(rendered).toContain("transcript incomplete");
    });
    dialog.handleInput("\t");
    const details = dialog.render(120).join("\n");
    expect(details).toContain("Available final result");
    expect(details).toContain("Transcript incomplete");
    dialog.dispose();
  });

  it("renders full messages and expands raw tool payloads by mouse", async () => {
    const store = new AgentRunTranscriptStore();
    stores.push(store);
    const toolRenderers = [{ name: "read" }];
    const rawToolPath = '"path": "src/index.ts"';
    const capture = store.createCapture(
      {
        runKey: "run-1",
        batchId: "batch-1",
        taskId: "inspect",
        kind: "Agent Run",
        label: "explore",
        cwd: "/work/project",
        modelId: "test/model",
        thinkingLevel: "high",
        tools: ["read"],
        taskDescription: "Inspect this file.",
        startedAt: 10,
      },
      "Child system prompt",
      toolRenderers,
    );
    const steering = {
      role: "user",
      content: "Steering: focus on the edge cases.",
      timestamp: 10,
    };
    const assistant = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Private reasoning." },
        { type: "text", text: "Visible answer." },
        { type: "toolCall", id: "call-1", name: "read", arguments: { path: "src/index.ts" } },
      ],
      timestamp: 11,
    };
    const toolResult = {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "read",
      content: [{ type: "text", text: "File output." }],
      details: {},
      isError: false,
      timestamp: 12,
    };
    capture.observe(
      { type: "message_end", message: steering } as never,
      "Child system prompt",
      toolRenderers,
    );
    capture.observe(
      { type: "message_end", message: assistant } as never,
      "Child system prompt",
      toolRenderers,
    );
    capture.observe(
      { type: "message_end", message: toolResult } as never,
      "Child system prompt",
      toolRenderers,
    );
    capture.observe({ type: "agent_start" } as never, "Child system prompt", toolRenderers);
    capture.observe({ type: "turn_start" } as never, "Child system prompt", toolRenderers);
    capture.observe({ type: "agent_settled" } as never, "Child system prompt", toolRenderers);
    const capturedDocument = await capture.load();
    expect(capturedDocument.operations.map(({ type }) => type)).toEqual([
      "agent_start",
      "turn_start",
      "agent_settled",
    ]);

    const run = data().runs[0];
    if (!run) throw new Error("Missing test run");
    const dialog = new AgentsDialog(
      data({
        runs: [
          {
            ...run,
            key: "last:inspect",
            runKey: "run-1",
            active: false,
            status: "completed",
            transcriptSource: capture,
          },
        ],
      }),
      dependencies(80),
    );
    openConversation(dialog);
    await vi.waitFor(() => expect(dialog.render(120).join("\n")).toContain("Visible answer."));
    let lines = dialog.render(120);
    const conversationText = lines.join("\n");
    expect(conversationText).toContain("Steering: focus on the edge cases.");
    expect(conversationText).toContain("Visible answer.");
    expect(conversationText).toContain("Private reasoning.");
    expect(conversationText).toContain("File output.");
    expect(conversationText).toContain('path="src/index.ts"');
    expect(conversationText).not.toContain(rawToolPath);
    expect(conversationText).not.toContain("Child system prompt");
    expect(conversationText).not.toContain("Raw tool input/result hidden");
    expect(conversationText).not.toContain("Run events");
    expect(conversationText).not.toContain("agent_start");
    expect(conversationText).not.toContain("turn_start");
    expect(conversationText).not.toContain("agent_settled");
    expect(conversationText).not.toContain("assistant ·");
    expect(conversationText).not.toContain("user ·");
    expect(conversationText).not.toContain("toolResult ·");
    expect(conversationText.match(/File output\./g)).toHaveLength(1);
    for (const key of ["\u0014", "\u001b[116;5u"]) {
      dialog.handleInput(key);
      expect(dialog.render(120).join("\n")).not.toContain("Private reasoning.");
      dialog.handleInput(key);
      expect(dialog.render(120).join("\n")).toContain("Private reasoning.");
    }
    dialog.handleInput("\t");
    lines = dialog.render(120);
    expect(lines.join("\n")).toContain("Child system prompt");
    expect(lines.join("\n")).toContain("Raw tool input/result hidden");
    expect(lines.join("\n")).not.toContain(rawToolPath);
    expect(lines.join("\n")).not.toContain("Run events");
    expect(lines.join("\n")).not.toContain("agent_start");
    expect(lines.join("\n")).not.toContain("turn_start");
    expect(lines.join("\n")).not.toContain("agent_settled");
    expect(lines.join("\n")).toContain(`user · ${new Date(10).toLocaleTimeString()}`);
    expect(lines.join("\n")).toContain(`assistant · ${new Date(11).toLocaleTimeString()}`);
    expect(lines.join("\n")).toContain(`toolResult · ${new Date(12).toLocaleTimeString()}`);
    const hiddenRow = lines.findIndex((line) => line.includes("Raw tool input/result hidden"));
    expect(hiddenRow).toBeGreaterThanOrEqual(0);
    expect(click(dialog, 50, hiddenRow)).toEqual({ handled: true });
    expect(dialog.render(120).join("\n")).toContain("Raw tool input/result");
    expect(dialog.render(120).join("\n")).toContain(rawToolPath);
    dialog.handleInput("\t");
    expect(dialog.render(120).join("\n")).toContain('path="src/index.ts"');
    expect(dialog.render(120).join("\n")).not.toContain(rawToolPath);
    dialog.handleInput("\t");
    expect(dialog.render(120).join("\n")).toContain(rawToolPath);
    dialog.handleInput("\u000f");
    expect(dialog.render(120).join("\n")).toContain("Raw tool input/result hidden");
    expect(dialog.render(120).join("\n")).not.toContain(rawToolPath);

    lines = dialog.render(120);
    const thinkingRow = lines.findIndex((line) => line.includes("Private reasoning."));
    expect(thinkingRow).toBeGreaterThanOrEqual(0);
    expect(click(dialog, 50, thinkingRow)).toMatchObject({ handled: true });
    expect(dialog.render(120).join("\n")).not.toContain("Private reasoning.");
    expect(dialog.render(120).join("\n")).toContain("Thinking is hidden");

    capture.observe(
      {
        type: "message_end",
        message: { role: "user", content: "Later transcript message.", timestamp: 13 },
      } as never,
      "Child system prompt",
      toolRenderers,
    );
    await capture.load();
    const updatedRun = data().runs[0];
    if (!updatedRun) throw new Error("Missing test run");
    dialog.updateData(
      data({
        runs: [
          {
            ...updatedRun,
            key: "last:inspect",
            runKey: "run-1",
            active: false,
            status: "completed",
            transcriptSource: capture,
          },
        ],
      }),
    );
    await vi.waitFor(() =>
      expect(dialog.render(120).join("\n")).toContain("Later transcript message."),
    );
    lines = dialog.render(100);
    expect(lines.join("\n")).toContain("Raw tool input/result hidden");
    expect(lines.join("\n")).not.toContain(rawToolPath);
    expect(lines.join("\n")).toContain("Thinking is hidden");
    dialog.dispose();
  });

  it("forwards a child tool renderer refresh to the dialog cache", async () => {
    const store = new AgentRunTranscriptStore();
    stores.push(store);
    let label = "before async refresh";
    let invalidateTool: (() => void) | undefined;
    const renderer: AgentRunToolRenderer = {
      name: "read",
      renderCall: (_args, _theme, context) => {
        invalidateTool = context.invalidate;
        return new Text(label, 0, 0);
      },
    };
    const capture = store.createCapture(
      {
        runKey: "run-1",
        batchId: "batch-1",
        taskId: "inspect",
        kind: "Agent Run",
        label: "explore",
        cwd: "/work/project",
        modelId: "test/model",
        thinkingLevel: "high",
        tools: ["read"],
        taskDescription: "Inspect this file.",
        startedAt: 1,
      },
      "Child system prompt",
      [renderer],
    );
    capture.observe(
      {
        type: "message_end",
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", id: "call-1", name: "read", arguments: { path: "src/a.ts" } },
          ],
        },
      } as never,
      "Child system prompt",
      [renderer],
    );
    await capture.finish();

    const run = data().runs[0];
    if (!run) throw new Error("Missing test run");
    const deps = dependencies(80);
    const dialog = new AgentsDialog(
      data({
        runs: [
          {
            ...run,
            key: "run:run-1",
            runKey: "run-1",
            active: false,
            status: "completed",
            transcriptSource: capture,
          },
        ],
      }),
      deps,
    );
    openConversation(dialog);
    await vi.waitFor(() => expect(dialog.render(120).join("\n")).toContain(label));
    if (!invalidateTool) throw new Error("Tool renderer did not load.");

    const previousRequestCount = vi.mocked(deps.tui.requestRender).mock.calls.length;
    label = "after async refresh";
    invalidateTool();

    expect(vi.mocked(deps.tui.requestRender).mock.calls.length).toBeGreaterThan(
      previousRequestCount,
    );
    expect(dialog.render(120).join("\n")).toContain("after async refresh");
    dialog.dispose();
  });

  it("keeps lifecycle events in storage but hides them from both transcript views", async () => {
    const store = new AgentRunTranscriptStore();
    stores.push(store);
    const capture = store.createCapture(
      {
        runKey: "run-1",
        batchId: "batch-1",
        taskId: "inspect",
        kind: "Agent Run",
        label: "explore",
        cwd: "/work/project",
        modelId: "test/model",
        thinkingLevel: "high",
        tools: [],
        taskDescription: "Inspect this file.",
        startedAt: 1,
      },
      "Child system prompt",
      [],
    );
    capture.observe({ type: "agent_start" } as never, "Child system prompt", []);
    capture.observe({ type: "turn_start" } as never, "Child system prompt", []);
    capture.observe(
      {
        type: "compaction_end",
        reason: "threshold",
        aborted: false,
        willRetry: false,
        result: {
          summary: "The compacted transcript kept the parser changes.",
          firstKeptEntryId: "entry-8",
          tokensBefore: 12_000,
          estimatedTokensAfter: 4_000,
          usage: { input: 100, output: 40, cacheRead: 20, totalTokens: 160 },
          details: { readFiles: ["src/worker.ts"], modifiedFiles: ["src/parser.ts"] },
        },
      } as never,
      "Child system prompt",
      [],
    );
    await capture.finish();
    const capturedDocument = await capture.load();
    expect(capturedDocument.operations.map(({ type }) => type)).toEqual([
      "agent_start",
      "turn_start",
      "compaction_end",
    ]);
    expect(capturedDocument.operations.at(-1)).toMatchObject({
      type: "compaction_end",
      summary: "The compacted transcript kept the parser changes.",
      tokensBefore: 12_000,
      usage: { cacheRead: 20 },
      details: { readFiles: ["src/worker.ts"], modifiedFiles: ["src/parser.ts"] },
    });

    const run = data().runs[0];
    if (!run) throw new Error("Missing test run");
    const dialog = new AgentsDialog(
      data({
        runs: [
          {
            ...run,
            key: "run:run-1",
            runKey: "run-1",
            active: false,
            status: "completed",
            transcriptSource: capture,
          },
        ],
      }),
      dependencies(80),
    );
    openConversation(dialog);
    await vi.waitFor(() => {
      expect(dialog.render(120).join("\n")).not.toContain("Loading the full Agent Run transcript");
    });
    const conversation = dialog.render(120).join("\n");
    expect(conversation).not.toContain("Run events");
    expect(conversation).not.toContain("agent_start");
    expect(conversation).not.toContain("turn_start");
    expect(conversation).not.toContain("compaction_end");
    expect(conversation).not.toContain("The compacted transcript kept the parser changes.");
    expect(conversation).not.toContain("tokensBefore");

    dialog.handleInput("\t");
    const details = dialog.render(120).join("\n");
    expect(details).toContain("inspect · Agent Run: explore");
    expect(details).toContain("Child system prompt");
    expect(details).not.toContain("Run events");
    expect(details).not.toContain("agent_start");
    expect(details).not.toContain("turn_start");
    expect(details).not.toContain("compaction_end");
    expect(details).not.toContain("The compacted transcript kept the parser changes.");
    expect(details).not.toContain("tokensBefore");
    expect(details).not.toContain('"cacheRead": 20');
    expect(details).not.toContain("src/worker.ts");
    expect(details).not.toContain("src/parser.ts");
    dialog.dispose();
  });
});
