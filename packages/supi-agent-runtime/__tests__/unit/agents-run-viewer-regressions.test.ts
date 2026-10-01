import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import type {
  AgentRunTranscriptDocument,
  AgentRunTranscriptSource,
} from "../../src/session/transcript-store.ts";
import { AgentsDialog } from "../../src/ui/agents-overlay.ts";
import type { AgentsDialogDependencies } from "../../src/ui/agents-overlay-data.ts";
import { makeAgentsRun } from "../helpers/agents-viewer-fixtures.ts";

function dependencies(
  rows = 24,
  overrides: Partial<AgentsDialogDependencies> = {},
): AgentsDialogDependencies {
  return {
    theme: makeCtx().ui.theme as never,
    done: vi.fn(),
    tui: { requestRender: vi.fn(), terminal: { rows } },
    onSteer: vi.fn(async () => "queued" as const),
    onStop: vi.fn(async () => "accepted" as const),
    ...overrides,
  };
}

function runList(count: number) {
  return Array.from({ length: count }, (_, index) =>
    makeAgentsRun({
      key: `run:${index}`,
      runKey: `run-${index}`,
      batchId: "batch-list",
      taskId: `task-${index}`,
      startedAt: Date.now() - index * 1_000,
      active: false,
      status: "completed",
    }),
  );
}

function incompleteSource(runKey: string): AgentRunTranscriptSource {
  const document: AgentRunTranscriptDocument = {
    metadata: {
      runKey,
      batchId: "batch-1",
      taskId: "Inspect this task.",
      kind: "Agent Run",
      label: "explore",
      cwd: "/repo",
      modelId: "test/model",
      thinkingLevel: "low",
      tools: ["read"],
      startedAt: 1,
    },
    systemPrompt: "",
    systemPromptHistory: [],
    messages: [],
    operations: [],
    status: "incomplete",
    messageCount: 0,
  };
  return {
    runKey,
    toolRenderers: [],
    getStatus: () => ({ status: "incomplete", revision: 1, messageCount: 0 }),
    load: async () => document,
  };
}

describe("Agent Run viewer regressions", () => {
  it("keeps an opened run selected when live activity changes the search result", async () => {
    const opened = makeAgentsRun({
      key: "run:opened",
      runKey: "opened",
      taskId: "opened-task",
      startedAt: Date.now(),
      recentActivity: ["needle"],
    });
    const other = makeAgentsRun({
      key: "run:other",
      runKey: "other",
      taskId: "other-task",
      startedAt: Date.now() - 1_000,
      recentActivity: ["needle"],
    });
    const onStop = vi.fn(async () => "accepted" as const);
    const dialog = new AgentsDialog({ runs: [opened, other] }, dependencies(24, { onStop }));
    for (const character of "needle") dialog.handleInput(character);
    dialog.handleInput("\n");

    dialog.updateData({ runs: [{ ...opened, recentActivity: ["new activity"] }, other] });
    expect(dialog.render(100).join("\n")).toContain("opened-task");
    expect(dialog.render(100).join("\n")).not.toContain("other-task");

    dialog.handleInput("x");
    dialog.handleInput("y");
    await vi.waitFor(() => expect(onStop).toHaveBeenCalledWith("opened"));
    dialog.handleInput("\u001b");
    const list = dialog.render(100).join("\n");
    expect(list).toContain("other-task");
    expect(list).not.toContain("opened-task");
  });

  it("selects another run when the opened run disappears", () => {
    const opened = makeAgentsRun({ taskId: "opened-task" });
    const other = makeAgentsRun({
      key: "run:other",
      runKey: "other",
      taskId: "other-task",
      startedAt: Date.now() - 1_000,
    });
    const dialog = new AgentsDialog({ runs: [opened, other] }, dependencies());
    dialog.handleInput("\n");
    dialog.updateData({ runs: [other] });
    expect(dialog.render(100).join("\n")).toContain("other-task");
  });

  it("keeps the selected row visible after a height-only resize", () => {
    const deps = dependencies(24);
    const dialog = new AgentsDialog({ runs: runList(12) }, deps);
    dialog.render(100);
    for (let index = 0; index < 4; index++) dialog.handleInput("\u001b[B");

    deps.tui.terminal.rows = 8;
    const lines = dialog.render(100).map(stripTerminalSequences);
    expect(lines.some((line) => line.includes("→ task-4"))).toBe(true);
    expect(lines.join("\n")).toContain("(5/12)");
  });

  it("clamps page navigation to the list bounds", () => {
    const runs = ["first", "second", "third"].map((taskId, index) =>
      makeAgentsRun({
        key: `run:${taskId}`,
        runKey: taskId,
        batchId: "batch-page",
        taskId,
        startedAt: Date.now() - index * 1_000,
        active: false,
        status: "completed",
      }),
    );
    const dialog = new AgentsDialog({ runs }, dependencies());
    dialog.render(100);
    dialog.handleInput("\u001b[5~");
    dialog.handleInput("\u001b[B");
    dialog.handleInput("\n");
    expect(dialog.render(100).join("\n")).toContain("second");
  });

  it("keeps left and right arrows in the search input", () => {
    const agent = makeAgentsRun({ taskId: "cat" });
    const otherAgent = makeAgentsRun({ key: "run:car", taskId: "car" });
    const review = makeAgentsRun({
      key: "review:other",
      taskId: "review-task",
      kind: "Reviewer",
    });
    const dialog = new AgentsDialog({ runs: [agent, otherAgent, review] }, dependencies());
    dialog.handleInput("c");
    dialog.handleInput("t");
    dialog.handleInput("\u001b[D");
    dialog.handleInput("a");
    expect(dialog.render(100).join("\n")).toContain("cat");
    expect(dialog.render(100).join("\n")).not.toContain("car");

    dialog.handleInput("\t");
    expect(dialog.render(100).join("\n")).toContain("No tasks match");
    dialog.handleInput("\u001b[Z");
    expect(dialog.render(100).join("\n")).toContain("cat");
  });

  it("shows active run elapsed time in the list", () => {
    const run = makeAgentsRun({ startedAt: Date.now() - 120_000 });
    const text = new AgentsDialog({ runs: [run] }, dependencies()).render(100).join("\n");
    expect(text).toContain("2m");
    expect(text).not.toContain("0s");
  });

  it("refreshes active elapsed time and keeps finished durations fixed", () => {
    vi.useFakeTimers();
    try {
      const now = new Date("2025-01-01T00:00:00.000Z");
      vi.setSystemTime(now);
      const active = makeAgentsRun({
        key: "run:active",
        runKey: "active",
        taskId: "active-task",
        startedAt: now.getTime() - 2_000,
      });
      const finished = makeAgentsRun({
        key: "run:finished",
        runKey: "finished",
        taskId: "finished-task",
        startedAt: now.getTime() - 82_000,
        finishedAt: now.getTime() - 42_000,
        active: false,
        status: "completed",
      });
      const requestRender = vi.fn();
      const deps = dependencies(24, {
        tui: { requestRender, terminal: { rows: 24 } },
      });
      const dialog = new AgentsDialog({ runs: [active, finished] }, deps);
      expect(dialog.render(100).join("\n")).toContain("2s");
      expect(dialog.render(100).join("\n")).toContain("40s");
      const beforeDispose = requestRender.mock.calls.length;

      vi.advanceTimersByTime(1_000);
      const updated = dialog.render(100).join("\n");
      expect(updated).toContain("3s");
      expect(updated).toContain("40s");
      expect(requestRender).toHaveBeenCalledTimes(beforeDispose + 1);

      dialog.dispose();
      const afterDispose = requestRender.mock.calls.length;
      vi.advanceTimersByTime(2_000);
      expect(requestRender).toHaveBeenCalledTimes(afterDispose);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a selectable run and transcript content at short heights", () => {
    const listDialog = new AgentsDialog({ runs: runList(8) }, dependencies(6));
    const listText = stripTerminalSequences(listDialog.render(80).join("\n"));
    expect(listText).toContain("Search:");
    expect(listText).toContain("task-0");

    const run = makeAgentsRun({
      conversation: {
        entries: Array.from({ length: 40 }, (_, index) => ({
          kind: "assistant" as const,
          text: `short view message ${index + 1}`,
        })),
        omittedEntryCount: 0,
        omittedCharacterCount: 0,
        textTruncated: false,
      },
    });
    const conversationDialog = new AgentsDialog({ runs: [run] }, dependencies(8));
    conversationDialog.handleInput("\n");
    const conversationText = stripTerminalSequences(conversationDialog.render(80).join("\n"));
    expect(conversationText).toContain("short view message 40");
    expect(conversationText).toContain("LIVE");
    listDialog.dispose();
    conversationDialog.dispose();
  });

  it.each([6, 7])("keeps a long heading and warning in %i rows", async (rows) => {
    const taskId = `task-${"long-".repeat(12)}`;
    const run = makeAgentsRun({
      key: "run:long-heading",
      runKey: "long-heading",
      taskId,
      label: `review-${"wide-".repeat(12)}`,
      transcriptSource: incompleteSource("long-heading"),
    });
    const onStop = vi.fn(async () => "accepted" as const);
    const dialog = new AgentsDialog({ runs: [run] }, dependencies(rows, { onStop }));
    dialog.handleInput("\n");
    await vi.waitFor(() =>
      expect(dialog.render(60).join("\n")).toContain("Transcript incomplete · LIVE"),
    );
    dialog.handleInput("x");
    dialog.handleInput("y");
    await vi.waitFor(() => expect(dialog.render(60).join("\n")).toContain("Control accepted."));

    const lines = dialog.render(60);
    const text = stripTerminalSequences(lines.join("\n"));
    expect(lines).toHaveLength(rows);
    expect(text).toContain(taskId.slice(0, 20));
    expect(text).toContain("Transcript incomplete · LIVE");
  });
});
