import { initTheme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { AgentRunToolRenderer } from "@mrclrchtr/supi-agent-runtime/api";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  type AgentRunTranscriptDocument,
  type AgentRunTranscriptSource,
  AgentRunTranscriptStore,
} from "../../src/tool/agent_run/transcript-store.ts";
import { AgentsDialog } from "../../src/ui/agents-overlay.ts";
import type {
  AgentsDialogDependencies,
  AgentsOverlayData,
} from "../../src/ui/agents-overlay-data.ts";

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
    onSteer: vi.fn(async () => "accepted" as const),
    onStop: vi.fn(async () => "accepted" as const),
  };
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
        finalText: "Available final result",
        conversationView: {
          taskId: run.taskId,
          profileId: run.profileId,
          entries: [{ kind: "assistant", text: "Retained conversation entry" }],
          omittedEntryCount: 0,
          omittedCharacterCount: 0,
          textTruncated: false,
          taskMetadata: { instructions: "Inspect this file." },
        },
        transcriptSource,
      },
    ],
  });
}

function data(overrides: Partial<AgentsOverlayData> = {}): AgentsOverlayData {
  return {
    runs: [
      {
        key: "active:inspect",
        active: true,
        taskId: "inspect",
        profileId: "explore",
        status: "running",
        modelId: "test/model",
        thinkingLevel: "high",
        turns: 1,
        toolUses: 1,
        humanTruncated: false,
        modelTruncated: false,
        ...overrides.runs?.[0],
      },
    ],
    profiles: [],
    diagnostics: [],
    omittedDiagnosticCount: 0,
    omittedProfileCount: 0,
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
            conversationView: {
              taskId: "inspect",
              profileId: "explore",
              entries: Array.from({ length: 50 }, (_, index) => ({
                kind: "assistant" as const,
                text: `message ${index + 1}`,
              })),
              omittedEntryCount: 0,
              omittedCharacterCount: 0,
              textTruncated: false,
              taskMetadata: { instructions: "Inspect this file." },
            },
          },
        ],
      }),
      dependencies(24),
    );
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

    await vi.waitFor(() => {
      const rendered = dialog.render(120).join("\n");
      expect(rendered).toContain("Available final result");
      expect(rendered).toContain("Retained conversation entry");
    });
    expect(dialog.render(120).join("\n")).toContain("Transcript storage is unavailable");
    dialog.dispose();
  });

  it("shows the retained result and conversation with an empty incomplete transcript", async () => {
    const document: AgentRunTranscriptDocument = {
      metadata: {
        runKey: "run-1",
        batchId: "batch-1",
        taskId: "inspect",
        profileId: "explore",
        cwd: "/work/project",
        modelId: "test/model",
        thinkingLevel: "high",
        tools: [],
        instructions: "Inspect this file.",
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

    await vi.waitFor(() => {
      const rendered = dialog.render(120).join("\n");
      expect(rendered).toContain("Available final result");
      expect(rendered).toContain("Retained conversation entry");
    });
    dialog.dispose();
  });

  it("renders full messages and expands raw tool payloads by mouse", async () => {
    const store = new AgentRunTranscriptStore();
    stores.push(store);
    const toolRenderers = [{ name: "read" }];
    const capture = store.createCapture(
      {
        runKey: "run-1",
        batchId: "batch-1",
        taskId: "inspect",
        profileId: "explore",
        cwd: "/work/project",
        modelId: "test/model",
        thinkingLevel: "high",
        tools: ["read"],
        instructions: "Inspect this file.",
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
    await capture.load();

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
    await vi.waitFor(() =>
      expect(dialog.render(120).join("\n")).toContain("Raw tool input/result hidden"),
    );
    let lines = dialog.render(120);
    expect(lines.join("\n")).toContain("Child system prompt");
    expect(lines.join("\n")).toContain("Steering: focus on the edge cases.");
    expect(lines.join("\n")).toContain("Visible answer.");
    expect(lines.join("\n")).toContain("Private reasoning.");
    expect(lines.join("\n")).toContain("File output.");
    for (const key of ["t", "\u0014", "\u001b[116;5u"]) {
      dialog.handleInput(key);
      expect(dialog.render(120).join("\n")).not.toContain("Private reasoning.");
      dialog.handleInput(key);
      expect(dialog.render(120).join("\n")).toContain("Private reasoning.");
    }
    for (const key of ["o", "\u000f", "\u001b[111;5u"]) {
      dialog.handleInput(key);
      expect(dialog.render(120).join("\n")).toContain("src/index.ts");
      dialog.handleInput(key);
      expect(dialog.render(120).join("\n")).toContain("Raw tool input/result hidden");
    }
    const hiddenRow = lines.findIndex((line) => line.includes("Raw tool input/result hidden"));
    expect(hiddenRow).toBeGreaterThanOrEqual(0);
    expect(click(dialog, 38, hiddenRow)).toBeUndefined();
    expect(dialog.render(120).join("\n")).toContain("Raw tool input/result hidden");
    expect(click(dialog, 50, hiddenRow)).toEqual({ handled: true });
    expect(dialog.render(120).join("\n")).toContain("src/index.ts");

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
    expect(lines.join("\n")).toContain("src/index.ts");
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
        profileId: "explore",
        cwd: "/work/project",
        modelId: "test/model",
        thinkingLevel: "high",
        tools: ["read"],
        instructions: "Inspect this file.",
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

  it("shows compaction summaries, usage, and details in the transcript", async () => {
    const store = new AgentRunTranscriptStore();
    stores.push(store);
    const capture = store.createCapture(
      {
        runKey: "run-1",
        batchId: "batch-1",
        taskId: "inspect",
        profileId: "explore",
        cwd: "/work/project",
        modelId: "test/model",
        thinkingLevel: "high",
        tools: [],
        instructions: "Inspect this file.",
        startedAt: 1,
      },
      "Child system prompt",
      [],
    );
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

    await vi.waitFor(() => {
      const rendered = dialog.render(120).join("\n");
      expect(rendered).toContain("The compacted transcript kept the parser changes.");
      expect(rendered).toContain("tokensBefore: 12000");
      expect(rendered).toContain('"cacheRead": 20');
      expect(rendered).toContain("src/worker.ts");
      expect(rendered).toContain("src/parser.ts");
    });
    dialog.dispose();
  });
});
