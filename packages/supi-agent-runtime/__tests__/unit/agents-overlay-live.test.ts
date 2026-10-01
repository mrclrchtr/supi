import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import type {
  AgentRunDisplayConversation,
  AgentRunDisplayEntry,
} from "../../src/session/agent-run-registry-types.ts";
import { AgentsDialog } from "../../src/ui/agents-overlay.ts";
import type {
  AgentsDialogDependencies,
  AgentsOverlayData,
} from "../../src/ui/agents-overlay-data.ts";
import { makeAgentsRun } from "../helpers/agents-viewer-fixtures.ts";

function data(
  count = 40,
  options: { omittedEntryCount?: number; entries?: readonly AgentRunDisplayEntry[] } = {},
): AgentsOverlayData {
  const conversation: AgentRunDisplayConversation = {
    entries:
      options.entries ??
      Array.from({ length: count }, (_, index) => ({
        kind: "assistant" as const,
        text: `message ${index + 1}`,
      })),
    omittedEntryCount: options.omittedEntryCount ?? 0,
    omittedCharacterCount: 0,
    textTruncated: false,
  };
  return {
    runs: [
      makeAgentsRun({
        taskDescription: "Inspect the callers.",
        conversation,
      }),
    ],
  };
}

function dependencies(rows = 24): AgentsDialogDependencies {
  return {
    theme: makeCtx().ui.theme as never,
    tui: { requestRender: vi.fn(), terminal: { rows } },
    done: vi.fn(),
    onSteer: vi.fn(async () => "queued" as const),
    onStop: vi.fn(async () => "accepted" as const),
  };
}

function openConversation(dialog: AgentsDialog): void {
  dialog.handleInput("\n");
}

describe("AgentsDialog live output", () => {
  it.each([10, 24, 40])(
    "fits %i terminal rows and keeps latest output and controls visible",
    (rows) => {
      const dialog = new AgentsDialog(data(), dependencies(rows));
      openConversation(dialog);
      const lines = dialog.render(60);
      expect(lines).toHaveLength(rows);
      expect(lines.every((line) => visibleWidth(line) <= 60)).toBe(true);
      expect(lines.join("\n")).toContain("message 40");
      expect(lines.join("\n")).toContain("s steer · x stop");
      expect(lines.join("\n")).toContain("esc list");
      expect(lines.join("\n")).toContain("LIVE");
    },
  );

  it.each([9, 10, 12, 14])("keeps the selected run visible with %i terminal rows", (rows) => {
    const runs = ["first", "middle", "last"].map((taskId) =>
      makeAgentsRun({ taskId, key: `run:${taskId}` }),
    );
    const dialog = new AgentsDialog({ runs }, dependencies(rows));
    dialog.render(60);
    dialog.handleInput("\x1b[B");
    dialog.handleInput("\x1b[B");
    expect(dialog.render(60).some((line) => line.includes("last"))).toBe(true);
    dialog.handleInput("\n");
    const lines = dialog.render(60);
    expect(lines.join("\n")).toContain("last");
    expect(lines.join("\n")).toContain("s steer · x stop");
    expect(lines.join("\n")).toContain("Home/End");
    expect(lines).toHaveLength(rows);
  });

  it("follows subscription updates, pauses for reading, and resumes with End", () => {
    let listener: ((next: AgentsOverlayData) => void) | undefined;
    const unsubscribe = vi.fn();
    const deps = dependencies();
    const dialog = new AgentsDialog(data(), {
      ...deps,
      subscribe: (next) => {
        listener = next;
        return unsubscribe;
      },
    });
    openConversation(dialog);
    expect(dialog.render(80).join("\n")).toContain("message 40");
    listener?.(data(41));
    expect(deps.tui.requestRender).toHaveBeenCalled();
    expect(dialog.render(80).join("\n")).toContain("message 41");
    dialog.handleInput("\x1b[5~");
    const paused = dialog.render(80).filter((line) => line.includes("message"));
    listener?.(data(42));
    expect(dialog.render(80).filter((line) => line.includes("message"))).toEqual(paused);
    expect(dialog.render(80).join("\n")).toContain("PAUSED");
    dialog.handleInput("\x1b[F");
    expect(dialog.render(80).join("\n")).toContain("message 42");
    expect(dialog.render(80).join("\n")).toContain("LIVE");
    dialog.dispose();
    dialog.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("restores following through Page Down and keeps it on later updates", () => {
    const dialog = new AgentsDialog(data(), dependencies());
    openConversation(dialog);
    dialog.render(80);
    dialog.handleInput("\x1b[5~");
    dialog.render(80);
    dialog.handleInput("\x1b[6~");
    expect(dialog.render(80).join("\n")).toContain("LIVE");
    dialog.updateData(data(41));
    expect(dialog.render(80).join("\n")).toContain("message 41");
  });

  it("keeps a paused conversation position after a Details round trip", () => {
    const dialog = new AgentsDialog(data(), dependencies());
    openConversation(dialog);
    dialog.render(80);
    dialog.handleInput("\u001b[5~");
    const paused = dialog.render(80).filter((line) => line.includes("message"));
    expect(paused).not.toContainEqual(expect.stringContaining("message 40"));

    dialog.handleInput("\t");
    dialog.render(80);
    dialog.handleInput("\t");
    expect(dialog.render(80).filter((line) => line.includes("message"))).toEqual(paused);
    expect(dialog.render(80).join("\n")).toContain("PAUSED");
  });

  it("uses Details for task metadata and End to resume live output", () => {
    const dialog = new AgentsDialog(data(), dependencies());
    openConversation(dialog);
    dialog.render(80);
    dialog.handleInput("\x1b[H");
    expect(dialog.render(80).join("\n")).toContain("PAUSED");
    dialog.handleInput("\t");
    expect(dialog.render(80).join("\n")).toContain("Task: Inspect the callers.");
    dialog.handleInput("\t");
    dialog.handleInput("\x1b[F");
    expect(dialog.render(80).join("\n")).toContain("message 40");
    dialog.handleInput("\x1b[5~");
    expect(dialog.render(80).join("\n")).toContain("PAUSED");
    dialog.updateData(data(41));
    expect(dialog.render(80).join("\n")).not.toContain("message 41");
  });

  it("keeps retention notices visible while following a long conversation", () => {
    const dialog = new AgentsDialog(data(40, { omittedEntryCount: 100 }), dependencies());
    openConversation(dialog);
    expect(dialog.render(60).join("\n")).toContain("100 entries omitted");
    dialog.handleInput("\x1b[5~");
    expect(dialog.render(60).join("\n")).toContain("100 entries omitted");
  });

  it("preserves the selected run and reading position when rows change order", () => {
    const first = makeAgentsRun();
    const second = makeAgentsRun({ key: "run:other", runKey: "other", taskId: "other" });
    const dialog = new AgentsDialog({ runs: [first, second] }, dependencies());
    openConversation(dialog);
    dialog.render(80);
    dialog.handleInput("\x1b[5~");
    const paused = dialog.render(80).filter((line) => line.includes("message"));
    dialog.updateData({ runs: [second, first] });
    expect(dialog.render(80).filter((line) => line.includes("message"))).toEqual(paused);
    expect(dialog.render(80).join("\n")).toContain("PAUSED");
    dialog.handleInput("\x1b[F");
    expect(dialog.render(80).join("\n")).toContain("LIVE");
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])("does not overflow a terminal with only %i rows", (rows) => {
    const dialog = new AgentsDialog(data(), dependencies(rows));
    expect(dialog.render(60)).toHaveLength(Math.max(1, rows));
  });

  it.each([1, 2, 3, 4, 5, 6])("keeps the steering input visible in %i terminal rows", (rows) => {
    const dialog = new AgentsDialog(data(), dependencies(rows));
    openConversation(dialog);
    dialog.handleInput("s");
    const lines = dialog.render(60);
    expect(lines).toHaveLength(Math.max(1, rows));
    expect(stripTerminalSequences(lines.join("\n"))).toContain("Steering message");
  });

  it("keeps empty steering guidance visible in a short terminal", () => {
    const dialog = new AgentsDialog(data(), dependencies(4));
    openConversation(dialog);
    dialog.handleInput("s");
    dialog.handleInput("\n");
    const text = stripTerminalSequences(dialog.render(60).join("\n"));
    expect(text).toContain("Enter a steering message");
    expect(text).toContain("Steering message");
  });

  it("recalculates the viewport for a height-only resize", () => {
    const deps = dependencies(40);
    const dialog = new AgentsDialog(data(), deps);
    openConversation(dialog);
    const before = dialog.render(80);
    deps.tui.terminal.rows = 24;
    const after = dialog.render(80);
    expect(after.length).toBeLessThan(before.length);
    expect(after).toHaveLength(24);
    expect(after.join("\n")).toContain("message 40");
  });

  it("pages within one long wrapped message without hiding its end", () => {
    const entries: readonly AgentRunDisplayEntry[] = [
      { kind: "assistant", text: `${"wrapped output ".repeat(600)}LATEST` },
    ];
    const dialog = new AgentsDialog(data(1, { entries }), dependencies());
    openConversation(dialog);
    expect(dialog.render(60).join("\n")).toContain("LATEST");
    dialog.handleInput("\x1b[5~");
    expect(dialog.render(60).join("\n")).not.toContain("LATEST");
    expect(dialog.render(60).join("\n")).toContain("wrapped output");
    dialog.handleInput("\x1b[F");
    expect(dialog.render(60).join("\n")).toContain("LATEST");
  });
});
