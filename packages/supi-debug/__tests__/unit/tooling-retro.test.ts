import type { DebugEventView } from "@mrclrchtr/supi-core/debug";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
  subscribeDebugPersistence,
} from "@mrclrchtr/supi-core/debug";
import { SIDE_RUN_END_EVENT, SIDE_RUN_START_EVENT } from "@mrclrchtr/supi-core/session";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TOOLING_RETRO_PROMPT } from "../../src/tooling-retro/prompt.ts";
import {
  registerToolingRetroCommand,
  TOOLING_RETRO_ANCHOR_TYPE,
} from "../../src/tooling-retro/register.ts";
import {
  TOOLING_RETRO_PROMPT_TYPE,
  TOOLING_RETRO_REPORT_TYPE,
  withoutReportHeading,
} from "../../src/tooling-retro/render.ts";

interface Command {
  handler: (args: string, ctx: unknown) => Promise<void>;
}

type Entry = Record<string, unknown> & { id: string };

const TIMESTAMP = "2026-11-19T10:00:00.000Z";
let branch: Entry[];
let persisted: DebugEventView[];

function message(id: string, role: string, text: string, stopReason?: string): Entry {
  return {
    type: "message",
    id,
    timestamp: TIMESTAMP,
    message: { role, content: [{ type: "text", text }], ...(stopReason ? { stopReason } : {}) },
  };
}

/**
 * Simulate Pi's session tree for the command: appended entries extend the branch, the
 * triggered run appends the given `run` entries, and navigation truncates to the target.
 */
function setup(run: Entry[] = [], onSend?: () => void) {
  const pi = createPiMock();
  const appended: Array<{ type: string; data: unknown }> = [];
  pi.appendEntry = vi.fn((type: string, data: unknown) => {
    appended.push({ type, data });
    branch.push({ type: "custom", id: `custom-${appended.length}`, customType: type, data });
  });
  pi.sendMessage = vi.fn((sent: Record<string, unknown>) => {
    onSend?.();
    branch.push({ type: "custom_message", id: "prompt", ...sent }, ...run);
  });
  registerToolingRetroCommand(pi as never);
  const navigateTree = vi.fn(async (targetId: string) => {
    branch = branch.slice(0, branch.findIndex((entry) => entry.id === targetId) + 1);
    return { cancelled: false };
  });
  const getSessionFile = vi.fn(() => "/sessions/a.jsonl");
  const ctx = makeCtx({
    isIdle: vi.fn(() => true),
    waitForIdle: vi.fn(async () => {}),
    navigateTree,
    sessionManager: {
      getBranch: vi.fn(() => branch),
      getLeafId: vi.fn(() => branch.at(-1)?.id ?? null),
      getSessionFile,
    },
  });
  const command = pi.commands.get("supi-tooling-retro") as Command;
  return { pi, ctx, command, appended, navigateTree, getSessionFile };
}

function enablePersistence() {
  configureDebugRegistry({ enabled: true });
  subscribeDebugPersistence((event) => persisted.push(event));
}

const report = (text: string, stopReason = "stop") => [
  message("a1", "assistant", text, stopReason),
];

describe("/supi-tooling-retro", () => {
  beforeEach(() => {
    resetDebugRegistry();
    persisted = [];
    branch = [message("t1", "user", "Fix the bug"), message("t2", "assistant", "Fixed.", "stop")];
  });

  it("runs on a side branch, returns to the anchor, and records one event", async () => {
    enablePersistence();
    const { pi, ctx, command, appended, navigateTree } = setup(report("## Retro\nHelpful."));

    await command.handler("", ctx);

    expect(pi.sendMessage).toHaveBeenCalledWith(
      { customType: TOOLING_RETRO_PROMPT_TYPE, content: TOOLING_RETRO_PROMPT, display: true },
      { triggerTurn: true },
    );
    expect(navigateTree).toHaveBeenCalledWith("custom-1", { summarize: false });
    // The continued branch holds the task, the anchor, and the display-only report entry.
    expect(branch.map((entry) => entry.type)).toEqual(["message", "message", "custom", "custom"]);
    expect(appended.map((entry) => entry.type)).toEqual([
      TOOLING_RETRO_ANCHOR_TYPE,
      TOOLING_RETRO_REPORT_TYPE,
    ]);
    expect(appended[1]?.data).toEqual({ text: "## Retro\nHelpful.", stored: true });
    expect(ctx.ui.notify).not.toHaveBeenCalled();
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      source: "supi-debug",
      category: "tooling-retrospective",
      level: "info",
      data: {
        status: "completed",
        promptRevision: 2,
        text: "## Retro\nHelpful.",
        runKey: `a1:${Date.parse(TIMESTAMP)}`,
      },
    });
  });

  it("still runs without persistence, warns before sending, and records nothing", async () => {
    configureDebugRegistry({ enabled: true });
    const { pi, ctx, command, appended } = setup(report("Report"));

    await command.handler("", ctx);

    expect(pi.sendMessage).toHaveBeenCalledOnce();
    expect(ctx.ui.notify).toHaveBeenCalledOnce();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("will not be stored"),
      "warning",
    );
    expect(appended[1]?.data).toEqual({ text: "Report", stored: false });
    expect(getDebugEvents().events).toHaveLength(0);
  });

  it("warns after the report when persistence stopped during the run", async () => {
    enablePersistence();
    const { ctx, command } = setup(report("Report"), () =>
      configureDebugRegistry({ persistLevel: "warning" }),
    );

    await command.handler("", ctx);

    expect(persisted).toHaveLength(0);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("will not be stored"),
      "warning",
    );
  });

  it.each([
    ["failed", report("Partial", "error")],
    ["truncated", report("Partial", "length")],
    ["aborted", report("", "aborted")],
    ["unanswered", []],
  ])("returns to the anchor and records nothing for %s runs", async (_label, run) => {
    enablePersistence();
    const { ctx, command, appended, navigateTree } = setup(run);

    await command.handler("", ctx);

    expect(navigateTree).toHaveBeenCalledOnce();
    expect(branch.at(-1)?.customType).toBe(TOOLING_RETRO_ANCHOR_TYPE);
    expect(appended).toHaveLength(1);
    expect(persisted).toHaveLength(0);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("did not complete"),
      "warning",
    );
  });

  it("ignores answers to a later user message", async () => {
    enablePersistence();
    const { ctx, command } = setup([
      message("u2", "user", "Actually, continue the task"),
      message("a2", "assistant", "Continuing.", "stop"),
    ]);
    await command.handler("", ctx);
    expect(persisted).toHaveLength(0);
  });

  it("does not navigate when the session changed during the run", async () => {
    enablePersistence();
    const { ctx, command, navigateTree, getSessionFile } = setup(report("Report"));
    getSessionFile.mockReturnValueOnce("/sessions/a.jsonl").mockReturnValue("/sessions/b.jsonl");

    await command.handler("", ctx);

    expect(navigateTree).not.toHaveBeenCalled();
    expect(persisted).toHaveLength(0);
  });

  it("waits for a busy agent before branching", async () => {
    enablePersistence();
    const { pi, ctx, command } = setup(report("Report"));
    const order: string[] = [];
    Object.assign(ctx, {
      isIdle: () => false,
      waitForIdle: async () => {
        order.push("idle");
      },
    });
    (pi.appendEntry as ReturnType<typeof vi.fn>).mockImplementationOnce((type: string) => {
      order.push("anchor");
      branch.push({ type: "custom", id: "custom-1", customType: type });
    });
    await command.handler("", ctx);
    expect(order.slice(0, 3)).toEqual(["idle", "anchor", "idle"]);
  });

  describe("placement dialog", () => {
    function withChoice(
      ctx: ReturnType<typeof setup>["ctx"],
      pick: (options: string[]) => unknown,
    ) {
      const select = vi.fn(async (_title: string, options: string[]) => pick(options));
      Object.assign(ctx, { hasUI: true, ui: { ...ctx.ui, select } });
      return select;
    }

    it("offers the side branch first, so Enter keeps the previous behavior", async () => {
      const { ctx, command, navigateTree } = setup(report("Report"));
      const select = withChoice(ctx, (options) => options[0]);

      await command.handler("", ctx);

      expect(select.mock.calls[0]?.[1]?.[0]).toMatch(/^Side branch/);
      expect(navigateTree).toHaveBeenCalledOnce();
    });

    it("runs on the main path without anchor, navigation, report entry, or side-run signal", async () => {
      enablePersistence();
      const { pi, ctx, command, appended, navigateTree } = setup(report("## Retro\nHelpful."));
      const order: string[] = [];
      pi.events.on(SIDE_RUN_START_EVENT, () => order.push("start"));
      withChoice(ctx, (options) => options.find((option) => option.startsWith("Main path")));

      await command.handler("", ctx);

      expect(pi.sendMessage).toHaveBeenCalledOnce();
      expect(navigateTree).not.toHaveBeenCalled();
      expect(appended).toHaveLength(0);
      expect(order).toHaveLength(0);
      // The prompt and answer stay on the main path.
      expect(branch.at(-1)?.id).toBe("a1");
      expect(persisted).toHaveLength(1);
      expect(persisted[0]).toMatchObject({ data: { text: "## Retro\nHelpful." } });
    });

    it("cancels without side effects when the dialog is dismissed", async () => {
      const { pi, ctx, command, appended } = setup(report("Report"));
      withChoice(ctx, () => undefined);

      await command.handler("", ctx);

      expect(pi.sendMessage).not.toHaveBeenCalled();
      expect(appended).toHaveLength(0);
      expect(ctx.ui.notify).not.toHaveBeenCalled();
    });

    it("asks before waiting for a busy agent", async () => {
      const { ctx, command } = setup(report("Report"));
      const order: string[] = [];
      withChoice(ctx, (options) => {
        order.push("select");
        return options[0];
      });
      Object.assign(ctx, {
        isIdle: () => false,
        waitForIdle: async () => {
          order.push("idle");
        },
      });

      await command.handler("", ctx);

      expect(order.slice(0, 2)).toEqual(["select", "idle"]);
    });
  });

  describe("side-run signal", () => {
    function track(pi: ReturnType<typeof setup>["pi"], order: string[]) {
      pi.events.on(SIDE_RUN_START_EVENT, (data) => order.push(`start:${JSON.stringify(data)}`));
      pi.events.on(SIDE_RUN_END_EVENT, () => order.push("end"));
    }

    it("spans the run and the return to the anchor", async () => {
      const order: string[] = [];
      const { pi, ctx, command, navigateTree } = setup(report("Report"), () => order.push("send"));
      track(pi, order);
      navigateTree.mockImplementationOnce(async () => {
        order.push("navigate");
        return { cancelled: false };
      });

      await command.handler("", ctx);

      expect(order).toEqual(['start:{"source":"supi-debug"}', "send", "navigate", "end"]);
    });

    it("ends when the session changed during the run", async () => {
      const order: string[] = [];
      const { pi, ctx, command, getSessionFile } = setup(report("Report"));
      track(pi, order);
      getSessionFile.mockReturnValueOnce("/sessions/a.jsonl").mockReturnValue("/sessions/b.jsonl");

      await command.handler("", ctx);

      expect(order.at(-1)).toBe("end");
      expect(order).toHaveLength(2);
    });

    it("ends and rethrows when navigation fails", async () => {
      const order: string[] = [];
      const { pi, ctx, command, navigateTree } = setup(report("Report"));
      track(pi, order);
      navigateTree.mockRejectedValueOnce(new Error("navigation failed"));

      await expect(command.handler("", ctx)).rejects.toThrow("navigation failed");

      expect(order).toHaveLength(2);
      expect(order.at(-1)).toBe("end");
    });

    it("keeps the run result when the end signal hits a stale extension instance", async () => {
      const { pi, ctx, command, appended } = setup(report("Report"));
      const emit = pi.events.emit as ReturnType<typeof vi.fn>;
      emit.mockImplementation((channel: string) => {
        if (channel === SIDE_RUN_END_EVENT) throw new Error("This extension ctx is stale");
      });

      await command.handler("", ctx);

      expect(appended.map((entry) => entry.type)).toContain(TOOLING_RETRO_REPORT_TYPE);
    });
  });

  it("omits only a leading report heading when rendering", () => {
    const heading = ["##", "SuPi", "Tooling", "Retrospective"].join(" ");
    expect(withoutReportHeading(`${heading}\n\n**Task**: x`)).toBe("**Task**: x");
    expect(withoutReportHeading(`**Task**: x\n${heading}\n`)).toBe(`**Task**: x\n${heading}\n`);
  });
});
