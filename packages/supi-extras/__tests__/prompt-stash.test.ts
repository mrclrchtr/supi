import { beforeEach, describe, expect, it, vi } from "vitest";

const { copyToClipboardMock } = vi.hoisted(() => ({
  copyToClipboardMock: vi.fn(async () => true),
}));

vi.mock("../src/clipboard.ts", () => ({
  copyToClipboard: copyToClipboardMock,
}));

import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import promptStash, { _resetStashes } from "../src/prompt-stash.ts";

describe("promptStash extension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetStashes();
  });

  it("registers alt+s shortcut", () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    expect(pi.getShortcutHandlers("alt+s")).toHaveLength(1);
  });

  it("registers /supi-stash command", () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    expect(pi.getCommandHandler("supi-stash")).toBeDefined();
  });

  it("stashes editor text on alt+s and clears editor", async () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    const ctx = makeCtx({ cwd: "/tmp" });
    ctx.ui.getEditorText = vi.fn(() => "Fix the auth bug in login.ts");
    ctx.ui.input = vi.fn(async () => "auth bug");

    await pi.getShortcutHandlers("alt+s")[0](ctx);

    expect(ctx.ui.setEditorText).toHaveBeenCalledWith("");
    expect(ctx.ui.notify).toHaveBeenCalledWith('Stashed: "auth bug"', "info");
  });

  it("uses auto-generated name when input is empty", async () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    const ctx = makeCtx({ cwd: "/tmp" });
    ctx.ui.getEditorText = vi.fn(() => "Refactor the database layer");
    ctx.ui.input = vi.fn(async () => "");

    await pi.getShortcutHandlers("alt+s")[0](ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      'Stashed: "Refactor the database layer"',
      "info",
    );
  });

  it("warns when editor is empty on alt+s", async () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    const ctx = makeCtx({ cwd: "/tmp" });
    ctx.ui.getEditorText = vi.fn(() => "   ");

    await pi.getShortcutHandlers("alt+s")[0](ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("Editor is empty — nothing to stash", "warning");
    expect(ctx.ui.input).not.toHaveBeenCalled();
  });

  it("restores stash via /supi-stash command", async () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    const stashCtx = makeCtx({ cwd: "/tmp" });
    stashCtx.ui.getEditorText = vi.fn(() => "restore me");
    stashCtx.ui.input = vi.fn(async () => "restore test");
    await pi.getShortcutHandlers("alt+s")[0](stashCtx);

    const restoreCtx = makeCtx({ cwd: "/tmp" });
    restoreCtx.ui.custom = vi.fn(async () => ({
      action: "restore",
      stash: {
        id: "stash-1",
        name: "restore test",
        text: "restore me",
        createdAt: Date.now(),
      },
    }));

    const cmd = pi.getCommandHandler("supi-stash") as (args: string, ctx: unknown) => Promise<unknown>;
    await cmd("", restoreCtx);

    expect(restoreCtx.ui.custom).toHaveBeenCalledWith(expect.any(Function), { overlay: true });
    expect(restoreCtx.ui.setEditorText).toHaveBeenCalledWith("restore me");
    expect(restoreCtx.ui.notify).toHaveBeenCalledWith('Restored: "restore test"', "info");
  });

  it("notifies when no stashes exist for /supi-stash", async () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    const ctx = makeCtx({ cwd: "/tmp" });
    const cmd = pi.getCommandHandler("supi-stash") as (args: string, ctx: unknown) => Promise<unknown>;
    await cmd("", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("No stashed prompts", "info");
  });

  it("clears all stashes via /supi-stash", async () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    const ctx = makeCtx({ cwd: "/tmp" });
    ctx.ui.getEditorText = vi.fn(() => "text to clear");
    ctx.ui.input = vi.fn(async () => "clear me");
    await pi.getShortcutHandlers("alt+s")[0](ctx);

    const clearCtx = makeCtx({ cwd: "/tmp" });
    clearCtx.ui.custom = vi.fn(async () => ({ action: "cleared" }));
    const cmd = pi.getCommandHandler("supi-stash") as (args: string, ctx: unknown) => Promise<unknown>;
    await cmd("", clearCtx);

    expect(clearCtx.ui.notify).toHaveBeenCalledWith("All stashes cleared", "info");
  });

  it("copies selected stash via /supi-stash", async () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    const stashCtx = makeCtx({ cwd: "/tmp" });
    stashCtx.ui.getEditorText = vi.fn(() => "copy me");
    stashCtx.ui.input = vi.fn(async () => "copy test");
    await pi.getShortcutHandlers("alt+s")[0](stashCtx);

    const copyCtx = makeCtx({ cwd: "/tmp" });
    copyCtx.ui.custom = vi.fn(async () => ({
      action: "copy",
      stash: {
        id: "stash-1",
        name: "copy test",
        text: "copy me",
        createdAt: Date.now(),
      },
    }));
    const cmd = pi.getCommandHandler("supi-stash") as (args: string, ctx: unknown) => Promise<unknown>;
    await cmd("", copyCtx);

    expect(copyToClipboardMock).toHaveBeenCalledWith("copy me", "/tmp", pi);
    expect(copyCtx.ui.notify).toHaveBeenCalledWith('Copied "copy test" to clipboard', "info");
  });
});
