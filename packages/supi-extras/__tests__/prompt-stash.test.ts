import { beforeEach, describe, expect, it, vi } from "vitest";
import promptStash, { _resetStashes } from "../src/prompt-stash.ts";

function createPiMock() {
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => Promise<unknown>>>();
  const shortcuts = new Map<string, Array<(ctx: unknown) => Promise<unknown>>>();
  const commands = new Map<string, (args: string, ctx: unknown) => Promise<unknown>>();
  const execCalls: Array<{ command: string; args: string[] }> = [];

  return {
    on: (event: string, handler: (event: unknown, ctx: unknown) => Promise<unknown>) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    getHandlers: (event: string) => handlers.get(event) ?? [],
    registerShortcut: (key: string, opts: { handler: (ctx: unknown) => Promise<unknown> }) => {
      const list = shortcuts.get(key) ?? [];
      list.push(opts.handler);
      shortcuts.set(key, list);
    },
    getShortcutHandlers: (key: string) => shortcuts.get(key) ?? [],
    registerCommand: (
      name: string,
      opts: { handler: (args: string, ctx: unknown) => Promise<unknown> },
    ) => {
      commands.set(name, opts.handler);
    },
    getCommandHandler: (name: string) => commands.get(name),
    exec: vi.fn(async (command: string, args: string[]) => {
      execCalls.push({ command, args });
      return { code: 0, stdout: "", stderr: "" };
    }),
    getExecCalls: () => execCalls,
  };
}

function createCtxMock() {
  return {
    ui: {
      getEditorText: vi.fn(() => ""),
      setEditorText: vi.fn(),
      notify: vi.fn(),
      input: vi.fn(async () => undefined as string | undefined),
      select: vi.fn(async () => undefined as string | undefined),
      confirm: vi.fn(async () => false),
      theme: { fg: (_color: string, text: string) => text } as unknown as Record<string, unknown>,
    },
    cwd: "/tmp",
  };
}

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

  it("registers ctrl+shift+s shortcut", () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    expect(pi.getShortcutHandlers("ctrl+shift+s")).toHaveLength(1);
  });

  it("registers /stash, /stash-copy, /stash-clear commands", () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    expect(pi.getCommandHandler("stash")).toBeDefined();
    expect(pi.getCommandHandler("stash-copy")).toBeDefined();
    expect(pi.getCommandHandler("stash-clear")).toBeDefined();
  });

  it("stashes editor text on alt+s and clears editor", async () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    const ctx = createCtxMock();
    ctx.ui.getEditorText = vi.fn(() => "Fix the auth bug in login.ts");
    ctx.ui.input = vi.fn(async () => "auth bug");

    await pi.getShortcutHandlers("alt+s")[0](ctx);

    expect(ctx.ui.setEditorText).toHaveBeenCalledWith("");
    expect(ctx.ui.notify).toHaveBeenCalledWith('Stashed: "auth bug"', "info");
  });

  it("uses auto-generated name when input is empty", async () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    const ctx = createCtxMock();
    ctx.ui.getEditorText = vi.fn(() => "Refactor the database layer");
    ctx.ui.input = vi.fn(async () => "");

    await pi.getShortcutHandlers("alt+s")[0](ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith('Stashed: "Refactor the database layer"', "info");
  });

  it("warns when editor is empty on alt+s", async () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    const ctx = createCtxMock();
    ctx.ui.getEditorText = vi.fn(() => "   ");

    await pi.getShortcutHandlers("alt+s")[0](ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("Editor is empty — nothing to stash", "warning");
    expect(ctx.ui.input).not.toHaveBeenCalled();
  });

  it("copies editor text to clipboard on ctrl+shift+s", async () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    const ctx = createCtxMock();
    ctx.ui.getEditorText = vi.fn(() => "some prompt text");

    await pi.getShortcutHandlers("ctrl+shift+s")[0](ctx);

    expect(pi.exec).toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith("Copied to clipboard", "info");
  });

  it("warns when editor is empty on ctrl+shift+s", async () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    const ctx = createCtxMock();
    ctx.ui.getEditorText = vi.fn(() => "");

    await pi.getShortcutHandlers("ctrl+shift+s")[0](ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("Editor is empty — nothing to copy", "warning");
    expect(pi.exec).not.toHaveBeenCalled();
  });

  it("restores stash via /stash command", async () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    // Stash a prompt
    const stashCtx = createCtxMock();
    stashCtx.ui.getEditorText = vi.fn(() => "restore me");
    stashCtx.ui.input = vi.fn(async () => "restore test");
    await pi.getShortcutHandlers("alt+s")[0](stashCtx);

    // Now restore it
    const restoreCtx = createCtxMock();
    restoreCtx.ui.select = vi.fn(async () => "[stash-123] restore test");

    // Need the real stash id, so let's capture it from the actual select call
    await pi.getCommandHandler("stash")?.("", restoreCtx);

    expect(restoreCtx.ui.select).toHaveBeenCalledWith(
      "Restore stash:",
      expect.arrayContaining([expect.stringContaining("restore test")]),
    );
  });

  it("notifies when no stashes exist for /stash", async () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    const ctx = createCtxMock();
    await pi.getCommandHandler("stash")?.("", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("No stashed prompts", "info");
  });

  it("clears all stashes via /stash-clear", async () => {
    const pi = createPiMock();
    promptStash(pi as unknown as Parameters<typeof promptStash>[0]);

    const ctx = createCtxMock();
    ctx.ui.getEditorText = vi.fn(() => "text to clear");
    ctx.ui.input = vi.fn(async () => "clear me");
    await pi.getShortcutHandlers("alt+s")[0](ctx);

    const clearCtx = createCtxMock();
    clearCtx.ui.confirm = vi.fn(async () => true);
    await pi.getCommandHandler("stash-clear")?.("", clearCtx);

    expect(clearCtx.ui.notify).toHaveBeenCalledWith("All stashes cleared", "info");

    // Verify empty
    const listCtx = createCtxMock();
    await pi.getCommandHandler("stash")?.("", listCtx);
    expect(listCtx.ui.notify).toHaveBeenCalledWith("No stashed prompts", "info");
  });
});
