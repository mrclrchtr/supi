import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import { AgentsDialog } from "../../src/ui/agents-overlay.ts";
import type {
  AgentsDialogDependencies,
  AgentsOverlayRun,
} from "../../src/ui/agents-overlay-data.ts";
import { makeAgentsRun } from "../helpers/agents-viewer-fixtures.ts";

const ALT_LEFT = "\u001b[1;3D";
const ALT_RIGHT = "\u001b[1;3C";

function run(id: string, overrides: Partial<AgentsOverlayRun> = {}): AgentsOverlayRun {
  return makeAgentsRun({
    key: `run:${id}`,
    runKey: id,
    batchId: "batch-switcher",
    taskId: id,
    startedAt: 1_000,
    active: false,
    status: "completed",
    steeringAvailable: false,
    ...overrides,
  });
}

function conversation(latest: string) {
  return {
    entries: [
      ...Array.from({ length: 30 }, (_, index) => ({
        kind: "assistant" as const,
        text: `Earlier output ${index + 1}`,
      })),
      { kind: "assistant" as const, text: latest },
    ],
    omittedEntryCount: 0,
    omittedCharacterCount: 0,
    textTruncated: false,
  };
}

function dependencies(overrides: Partial<AgentsDialogDependencies> = {}): AgentsDialogDependencies {
  return {
    theme: makeCtx().ui.theme as never,
    done: vi.fn(),
    tui: { requestRender: vi.fn(), terminal: { rows: 24 } },
    onSteer: vi.fn(async () => "queued" as const),
    onStop: vi.fn(async () => "accepted" as const),
    ...overrides,
  };
}

function text(dialog: AgentsDialog): string {
  return stripTerminalSequences(dialog.render(100).join("\n"));
}

describe("/agents fast run switcher", () => {
  it("cycles filtered Agent runs and keeps Conversation or Details open", () => {
    const first = run("shared-one", {
      taskDescription: "First task details",
      conversation: conversation("First latest output"),
    });
    const second = run("shared-two", {
      taskDescription: "Second task details",
      conversation: conversation("Second latest output"),
    });
    const excluded = run("unrelated", {
      conversation: conversation("Unrelated output"),
    });
    const dialog = new AgentsDialog({ runs: [first, second, excluded] }, dependencies());
    for (const character of "shared") dialog.handleInput(character);
    dialog.handleInput("\n");

    expect(text(dialog)).toContain("Agents · 1/2 · shared-one");
    expect(text(dialog)).toContain("First latest output");
    expect(text(dialog)).toContain("Alt+← previous · Alt+→ next");
    dialog.handleInput("\u001b[5~");
    expect(text(dialog)).not.toContain("First latest output");
    dialog.handleInput(ALT_RIGHT);
    expect(text(dialog)).toContain("Agents · 2/2 · shared-two");
    expect(text(dialog)).toContain("Second latest output");
    expect(text(dialog)).not.toContain("Unrelated output");

    dialog.handleInput("\t");
    expect(text(dialog)).toContain("Task: Second task details");
    dialog.handleInput(ALT_LEFT);
    expect(text(dialog)).toContain("Agents · 1/2 · shared-one");
    expect(text(dialog)).toContain("Task: First task details");
    expect(text(dialog)).toContain("tab conversation");

    dialog.handleInput(ALT_LEFT);
    expect(text(dialog)).toContain("Agents · 2/2 · shared-two");
    expect(text(dialog)).toContain("Task: Second task details");

    dialog.handleInput("\u001b");
    const list = text(dialog);
    expect(list).toContain("Search: shared");
    expect(list).toContain("→ shared-two");
    expect(list).not.toContain("unrelated");
    dialog.dispose();
  });

  it("cycles only filtered Reviews when the Reviews section is open", () => {
    const dialog = new AgentsDialog(
      {
        runs: [
          run("agent", { taskId: "agent-run" }),
          run("review-one", {
            key: "review:one",
            kind: "Reviewer",
            taskId: "review-one",
            recentActivity: ["needle"],
            conversation: conversation("Review one output"),
          }),
          run("review-two", {
            key: "review:two",
            kind: "Reviewer",
            taskId: "review-two",
            recentActivity: ["needle"],
            conversation: conversation("Review two output"),
          }),
          run("review-excluded", {
            key: "review:excluded",
            kind: "Reviewer",
            taskId: "review-excluded",
          }),
        ],
      },
      dependencies(),
    );
    dialog.handleInput("\t");
    for (const character of "needle") dialog.handleInput(character);
    dialog.handleInput("\n");

    expect(text(dialog)).toContain("Reviews · 1/2 · review-one");
    dialog.handleInput(ALT_LEFT);
    expect(text(dialog)).toContain("Reviews · 2/2 · review-two");
    expect(text(dialog)).toContain("Review two output");
    expect(text(dialog)).not.toContain("review-excluded");
    dialog.dispose();
  });

  it("moves from a pinned run to matching results and stays put when none match", () => {
    const opened = run("opened", {
      taskId: "opened-task",
      recentActivity: ["needle"],
      conversation: conversation("Opened output"),
    });
    const matching = run("matching", {
      taskId: "matching-task",
      recentActivity: ["needle"],
      conversation: conversation("Matching latest output"),
    });
    const dialog = new AgentsDialog({ runs: [opened, matching] }, dependencies());
    for (const character of "needle") dialog.handleInput(character);
    dialog.handleInput("\n");
    dialog.updateData({
      runs: [{ ...opened, recentActivity: ["changed"] }, matching],
    });

    expect(text(dialog)).toContain("Agents · pinned · opened-task");
    dialog.handleInput(ALT_RIGHT);
    expect(text(dialog)).toContain("Agents · 1/1 · matching-task");
    expect(text(dialog)).toContain("Matching latest output");
    dialog.handleInput(ALT_RIGHT);
    expect(text(dialog)).toContain("Agents · 1/1 · matching-task");

    dialog.updateData({
      runs: [
        { ...opened, recentActivity: ["changed"] },
        { ...matching, recentActivity: ["changed"] },
      ],
    });
    expect(text(dialog)).toContain("Agents · pinned · matching-task");
    dialog.handleInput(ALT_LEFT);
    expect(text(dialog)).toContain("Agents · pinned · matching-task");
    dialog.handleInput("\u001b");
    expect(text(dialog)).toContain("No tasks match");
    dialog.dispose();
  });

  it("keeps one matching run selected without showing a switch hint", () => {
    const dialog = new AgentsDialog({ runs: [run("only-run")] }, dependencies());
    dialog.handleInput("\n");
    dialog.handleInput(ALT_LEFT);
    dialog.handleInput(ALT_RIGHT);

    expect(text(dialog)).toContain("Agents · 1/1 · only-run");
    expect(text(dialog)).not.toContain("Alt+← previous");
    dialog.dispose();
  });

  it("does not take steering input or stop confirmation keys", async () => {
    const first = makeAgentsRun({
      key: "run:first",
      runKey: "first",
      taskId: "first-task",
    });
    const second = makeAgentsRun({
      key: "run:second",
      runKey: "second",
      taskId: "second-task",
    });
    const onStop = vi.fn(async () => "accepted" as const);
    const dialog = new AgentsDialog({ runs: [first, second] }, dependencies({ onStop }));
    dialog.handleInput("\n");
    dialog.handleInput("s");
    dialog.handleInput(ALT_RIGHT);
    expect(text(dialog)).toContain("Agents · 1/2 · first-task");
    dialog.handleInput("\u001b");

    dialog.handleInput("x");
    dialog.handleInput(ALT_RIGHT);
    expect(text(dialog)).toContain("Stop first-task?");
    expect(text(dialog)).toContain("Agents · 1/2 · first-task");
    dialog.handleInput("y");
    await vi.waitFor(() => expect(onStop).toHaveBeenCalledWith("first"));
    dialog.dispose();
  });
});
