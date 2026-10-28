import { setImmediate as flushInputFrame } from "node:timers/promises";
import { type Terminal, TuiMainScreen } from "@earendil-works/pi-tui";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import { createCiStatusDialog } from "../../src/ui/status-overlay.ts";

describe("status overlay terminal navigation", () => {
  it("routes line and page navigation to the focused overlay across renders", async () => {
    let input: (data: string) => void = () => {
      throw new Error("Terminal not started");
    };
    const terminal: Terminal = {
      columns: 100,
      rows: 24,
      kittyProtocolActive: false,
      start(onInput) {
        input = onInput;
      },
      stop() {},
      async drainInput() {},
      write() {},
      moveBy() {},
      hideCursor() {},
      showCursor() {},
      clearLine() {},
      clearFromCursor() {},
      clearScreen() {},
      setTitle() {},
      setProgress() {},
      setProgramStatus() {},
    };
    const tui = new TuiMainScreen(terminal);
    const editor = { render: () => ["Editor"], invalidate() {} };
    tui.addChild(editor);
    tui.setFocus(editor);
    const dialog = createCiStatusDialog(
      {
        workspaceRoot: "/project",
        serverInventoryAvailable: true,
        capabilities: { semantic: { kind: "ready" }, structural: { kind: "ready" } },
        diagnostics: {
          kind: "completed",
          scope: { kind: "tracked-files", filter: null },
          entries: [],
          evidence: {
            requested: 0,
            confirmed: 0,
            unconfirmed: 0,
            failed: 0,
            removed: 0,
            documents: [],
          },
        },
        activeTools: [],
        servers: Array.from({ length: 8 }, (_, i) => ({
          name: "typescript",
          root: `/project/package-${i}`,
          status: "running",
          ready: true,
          fileTypes: ["ts"],
          openFiles: [],
        })),
      },
      { tui, theme: makeCtx().ui.theme, done() {} },
    );
    tui.start();
    const overlay = tui.showOverlay(dialog, { anchor: "center", width: "100%", maxHeight: "85%" });
    try {
      expect(tui.getFocusedComponent()).toBe(dialog);
      expect(dialog.render(100).join("\n")).toContain("Capabilities");
      input("\x1b[B");
      await flushInputFrame();
      expect(dialog.render(100).join("\n")).not.toContain("Capabilities");
      input("\x1b[6~");
      await flushInputFrame();
      const paged = dialog.render(100).join("\n");
      expect(paged).toContain("root: package-2");
      input("\x1b[5~");
      await flushInputFrame();
      expect(dialog.render(100).join("\n")).not.toBe(paged);
      expect(tui.getFocusedComponent()).toBe(dialog);
    } finally {
      overlay.hide();
      dialog.dispose();
      tui.stop();
    }
  });
});
