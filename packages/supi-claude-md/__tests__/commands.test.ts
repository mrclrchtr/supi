import { describe, expect, it, vi } from "vitest";
import { handleCommand } from "../commands.ts";

function makeCtx() {
  const notify = vi.fn();
  const custom = vi.fn().mockResolvedValue(undefined);
  return {
    cwd: "/tmp",
    ui: { notify, custom },
  };
}

describe("handleCommand", () => {
  it("opens the settings overlay", () => {
    const ctx = makeCtx();
    handleCommand("", ctx as never);

    expect(ctx.ui.custom).toHaveBeenCalledWith(expect.any(Function));
  });

  it("ignores extra arguments and still opens overlay", () => {
    const ctx = makeCtx();
    handleCommand("whatever", ctx as never);

    expect(ctx.ui.custom).toHaveBeenCalled();
  });
});
