import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import { AgentsDialog } from "../../src/ui/agents-overlay.ts";
import type {
  AgentsDialogDependencies,
  AgentsOverlayData,
} from "../../src/ui/agents-overlay-data.ts";

function data(count = 40): AgentsOverlayData {
  return {
    runs: [
      {
        key: "active:inspect",
        active: true,
        taskId: "inspect",
        profileId: "explore",
        status: "running",
        turns: 1,
        toolUses: 0,
        humanTruncated: false,
        modelTruncated: false,
        taskMetadata: { instructions: "Inspect the callers." },
        conversationView: {
          taskId: "inspect",
          profileId: "explore",
          taskMetadata: { instructions: "Inspect the callers." },
          entries: Array.from({ length: count }, (_, index) => ({
            kind: "assistant" as const,
            text: `message ${index + 1}`,
          })),
          omittedEntryCount: 0,
          omittedCharacterCount: 0,
          textTruncated: false,
        },
      },
    ],
    profiles: [],
    diagnostics: [],
    omittedDiagnosticCount: 0,
    omittedProfileCount: 0,
  };
}

function dependencies(rows = 24): AgentsDialogDependencies {
  return {
    theme: makeCtx().ui.theme as never,
    tui: { requestRender: vi.fn(), terminal: { rows } },
    done: vi.fn(),
    onSteer: vi.fn(async () => "accepted" as const),
    onStop: vi.fn(async () => "accepted" as const),
  };
}

describe("AgentsDialog live output", () => {
  it.each([10, 24, 40])(
    "fits %i terminal rows and keeps the latest output and controls visible",
    (rows) => {
      const dialog = new AgentsDialog(data(), dependencies(rows));
      const lines = dialog.render(60);
      expect(lines).toHaveLength(rows);
      expect(lines.every((line) => visibleWidth(line) <= 60)).toBe(true);
      expect(lines.join("\n")).toContain("message 40");
      expect(lines.join("\n")).toContain("s steer · x stop");
      expect(lines.join("\n")).toContain("esc close");
      expect(lines.join("\n")).toContain("LIVE");
    },
  );

  it.each([9, 10, 12, 14])("keeps the selected run visible with %i terminal rows", (rows) => {
    const input = data();
    const runs = ["first", "middle", "last"].map((taskId) => ({
      ...input.runs[0],
      key: `active:${taskId}`,
      taskId,
    }));
    const dialog = new AgentsDialog({ ...input, runs }, dependencies(rows));
    dialog.render(60);
    dialog.handleInput("\x1b[D");
    dialog.handleInput("\x1b[B");
    dialog.handleInput("\x1b[B");
    const list = dialog.render(60);
    expect(list.some((line) => line.includes("▶") && line.includes("last"))).toBe(true);
    dialog.handleInput("\x1b[C");
    const lines = dialog.render(60);
    expect(lines.join("\n")).toContain("Agents");
    expect(lines.join("\n")).toContain("Runs 3");
    expect(lines.join("\n")).toContain("s steer · x stop");
    expect(lines.join("\n")).toContain("end/f live");
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
    expect(dialog.render(80).join("\n")).toContain("message 40");
    listener?.(data(41));
    expect(deps.tui.requestRender).toHaveBeenCalled();
    expect(dialog.render(80).join("\n")).toContain("message 41");
    dialog.handleInput("\x1b[5~");
    const paused = dialog.render(80).filter((line) => line.includes("assistant:"));
    listener?.(data(42));
    expect(dialog.render(80).filter((line) => line.includes("assistant:"))).toEqual(paused);
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
    dialog.render(80);
    dialog.handleInput("\x1b[5~");
    dialog.render(80);
    dialog.handleInput("\x1b[6~");
    expect(dialog.render(80).join("\n")).toContain("LIVE");
    dialog.updateData(data(41));
    expect(dialog.render(80).join("\n")).toContain("message 41");
  });

  it("uses Home for metadata and f to pause or resume without changing the selected run", () => {
    const dialog = new AgentsDialog(data(), dependencies());
    dialog.render(80);
    dialog.handleInput("\x1b[H");
    expect(dialog.render(80).join("\n")).toContain("Instructions: Inspect the callers.");
    expect(dialog.render(80).join("\n")).toContain("PAUSED");
    dialog.handleInput("f");
    expect(dialog.render(80).join("\n")).toContain("message 40");
    dialog.handleInput("f");
    dialog.render(80);
    dialog.handleInput("\x1b[5~");
    expect(dialog.render(80).join("\n")).toContain("PAUSED");
    dialog.updateData(data(41));
    expect(dialog.render(80).join("\n")).not.toContain("message 41");
  });

  it("keeps retention notices visible while following a long conversation", () => {
    const input = data();
    const view = input.runs[0]?.conversationView;
    if (!view) throw new Error("Missing test conversation");
    view.omittedEntryCount = 100;
    const dialog = new AgentsDialog(input, dependencies());
    expect(dialog.render(60).join("\n")).toContain("100 entries omitted");
    dialog.handleInput("\x1b[5~");
    expect(dialog.render(60).join("\n")).toContain("100 entries omitted");
  });

  it("preserves the selected run and reading position when rows change order", () => {
    const input = data();
    const second = { ...input.runs[0], key: "active:other", taskId: "other" };
    const dialog = new AgentsDialog({ ...input, runs: [...input.runs, second] }, dependencies());
    dialog.render(80);
    dialog.handleInput("\x1b[5~");
    const paused = dialog.render(80).filter((line) => line.includes("assistant:"));
    dialog.updateData({ ...input, runs: [second, ...input.runs] });
    expect(dialog.render(80).filter((line) => line.includes("assistant:"))).toEqual(paused);
    expect(dialog.render(80).join("\n")).toContain("PAUSED");
    dialog.handleInput("\t");
    dialog.render(80);
    dialog.handleInput("\x1b[Z");
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
    dialog.handleInput("s");

    const lines = dialog.render(60);
    expect(lines).toHaveLength(Math.max(1, rows));
    expect(stripTerminalSequences(lines.join("\n"))).toContain("Steering message");
  });

  it("keeps empty steering guidance visible in a short terminal", () => {
    const dialog = new AgentsDialog(data(), dependencies(4));
    dialog.handleInput("s");
    dialog.handleInput("\n");

    const text = stripTerminalSequences(dialog.render(60).join("\n"));
    expect(text).toContain("Enter a steering message");
    expect(text).toContain("Steering message");
  });

  it("recalculates the viewport for a height-only resize", () => {
    const deps = dependencies(40);
    const dialog = new AgentsDialog(data(), deps);
    const before = dialog.render(80);
    deps.tui.terminal.rows = 24;
    const after = dialog.render(80);
    expect(after.length).toBeLessThan(before.length);
    expect(after).toHaveLength(24);
    expect(after.join("\n")).toContain("message 40");
  });

  it("pages within one long wrapped message without hiding its end", () => {
    const input = data(1);
    const view = input.runs[0]?.conversationView;
    if (!view) throw new Error("Missing test conversation");
    view.entries = [{ kind: "assistant", text: `${"wrapped output ".repeat(600)}LATEST` }];
    const dialog = new AgentsDialog(input, dependencies());
    expect(dialog.render(60).join("\n")).toContain("LATEST");
    dialog.handleInput("\x1b[5~");
    expect(dialog.render(60).join("\n")).not.toContain("LATEST");
    expect(dialog.render(60).join("\n")).toContain("wrapped output");
    dialog.handleInput("\x1b[F");
    expect(dialog.render(60).join("\n")).toContain("LATEST");
  });
});
