import { beforeEach, describe, expect, it, vi } from "vitest";

const { copyToClipboardMock } = vi.hoisted(() => ({
  copyToClipboardMock: vi.fn(async () => true),
}));

vi.mock("../src/clipboard.ts", () => ({
  copyToClipboard: copyToClipboardMock,
}));

import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import copyPrompt from "../src/copy-prompt.ts";

describe("copyPrompt extension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers alt+c shortcut", () => {
    const pi = createPiMock();
    copyPrompt(pi as unknown as Parameters<typeof copyPrompt>[0]);

    expect(pi.getShortcutHandlers("alt+c")).toHaveLength(1);
  });

  it("copies editor text to clipboard on alt+c", async () => {
    const pi = createPiMock();
    copyPrompt(pi as unknown as Parameters<typeof copyPrompt>[0]);

    const ctx = makeCtx({ cwd: "/tmp" });
    ctx.ui.getEditorText = vi.fn(() => "some prompt text");

    await pi.getShortcutHandlers("alt+c")[0](ctx);

    expect(copyToClipboardMock).toHaveBeenCalledWith("some prompt text", "/tmp", pi);
    expect(ctx.ui.notify).toHaveBeenCalledWith("Copied to clipboard", "info");
  });

  it("warns when editor is empty on alt+c", async () => {
    const pi = createPiMock();
    copyPrompt(pi as unknown as Parameters<typeof copyPrompt>[0]);

    const ctx = makeCtx({ cwd: "/tmp" });
    ctx.ui.getEditorText = vi.fn(() => "");

    await pi.getShortcutHandlers("alt+c")[0](ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("Editor is empty — nothing to copy", "warning");
    expect(copyToClipboardMock).not.toHaveBeenCalled();
  });

  it("warns when editor has only whitespace on alt+c", async () => {
    const pi = createPiMock();
    copyPrompt(pi as unknown as Parameters<typeof copyPrompt>[0]);

    const ctx = makeCtx({ cwd: "/tmp" });
    ctx.ui.getEditorText = vi.fn(() => "   ");

    await pi.getShortcutHandlers("alt+c")[0](ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("Editor is empty — nothing to copy", "warning");
    expect(copyToClipboardMock).not.toHaveBeenCalled();
  });
});
