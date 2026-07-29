import { beforeEach, describe, expect, it, vi } from "vitest";

const { forkFromMock, listAllMock } = vi.hoisted(() => ({
  forkFromMock: vi.fn(),
  listAllMock: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  SessionManager: { forkFrom: forkFromMock, listAll: listAllMock },
}));

import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import cloneSession from "../../src/clone-session.ts";

type CloneSessionCommand = {
  getArgumentCompletions: (
    prefix: string,
  ) => Promise<Array<{ value: string; label: string; description?: string }> | null>;
  handler: (args: string, ctx: ReturnType<typeof makeCtx>) => Promise<void>;
};

function setup() {
  const pi = createPiMock();
  cloneSession(pi as unknown as Parameters<typeof cloneSession>[0]);
  return pi.commands.get("clone-session") as CloneSessionCommand;
}

describe("cloneSession extension", () => {
  beforeEach(() => {
    forkFromMock.mockReset();
    listAllMock.mockReset();
    listAllMock.mockResolvedValue([{ id: "session-id", path: "/source/session.jsonl" }]);
    forkFromMock.mockReturnValue({ getSessionFile: () => "/target/cloned.jsonl" });
  });

  it("autocompletes session IDs and names", async () => {
    listAllMock.mockResolvedValue([
      { id: "alpha-id", name: "Alpha task", cwd: "/alpha", path: "/alpha/session.jsonl" },
      { id: "beta-id", name: "Beta task", cwd: "/beta", path: "/beta/session.jsonl" },
    ]);
    const command = setup();

    await expect(command.getArgumentCompletions("alpha")).resolves.toEqual([
      {
        value: "alpha-id",
        label: "alpha-id",
        description: "Alpha task — /alpha",
      },
    ]);
    await command.getArgumentCompletions("beta");

    expect(listAllMock).toHaveBeenCalledOnce();
  });

  it("clones a session by ID into the current worktree and switches to it", async () => {
    const { handler } = setup();
    const replacementNotify = vi.fn();
    const switchSession = vi.fn(async (_path, options) => {
      await options.withSession({ ui: { notify: replacementNotify } });
      return { cancelled: false };
    });
    const ctx = makeCtx({ cwd: "/target", switchSession });

    await handler(" session-id ", ctx);

    expect(listAllMock).toHaveBeenCalledOnce();
    expect(forkFromMock).toHaveBeenCalledWith("/source/session.jsonl", "/target");
    expect(switchSession).toHaveBeenCalledWith(
      "/target/cloned.jsonl",
      expect.objectContaining({ withSession: expect.any(Function) }),
    );
    expect(replacementNotify).toHaveBeenCalledWith("Session cloned into this worktree", "info");
  });

  it("shows usage when no session ID is provided", async () => {
    const { handler } = setup();
    const ctx = makeCtx();

    await handler("   ", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("Usage: /clone-session <session-id>", "warning");
    expect(listAllMock).not.toHaveBeenCalled();
  });

  it("warns when the session ID is not found", async () => {
    const { handler } = setup();
    const ctx = makeCtx();
    listAllMock.mockResolvedValue([]);

    await handler("missing-id", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("Session not found: missing-id", "warning");
    expect(forkFromMock).not.toHaveBeenCalled();
  });

  it("reports clone failures", async () => {
    const { handler } = setup();
    const ctx = makeCtx();
    forkFromMock.mockImplementation(() => {
      throw new Error("invalid session");
    });

    await handler("session-id", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("Could not clone session: invalid session", "error");
  });
});
