import type { ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Key,
  type KeybindingsManager,
  matchesKey,
  type OverlayOptions,
  type Terminal,
  TuiMainScreen,
} from "@earendil-works/pi-tui";
import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import { registerAgentsCommand } from "../../src/api.ts";

type DisposableComponent = Component & { dispose?(): void };
type InputComponent = DisposableComponent & { handleInput(data: string): void };

class AskUserOverlay implements Component {
  constructor(private readonly done: (result: { kind: "cancel" }) => void) {}

  render(): string[] {
    return ["Ask User form"];
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) this.done({ kind: "cancel" });
  }
}

describe("/agents with a stacked Ask User overlay", () => {
  it("keeps Escape local to the form, steering input, stop confirmation, and viewer", async () => {
    const terminal = makeTerminal();
    const tui = new TuiMainScreen(terminal);
    tui.requestRender = vi.fn();
    const components: DisposableComponent[] = [];
    const terminalInputHandlers: Array<(data: string) => { consume?: boolean } | undefined> = [];
    const theme = {
      fg: (_color: string, text: string) => text,
      bg: (_color: string, text: string) => text,
      bold: (text: string) => text,
    } as Theme;
    const keybindings = {
      matches: (data: string, action: string) => {
        if (action === "app.interrupt") return matchesKey(data, Key.escape);
        if (action === "tui.select.cancel") return matchesKey(data, Key.ctrl("c"));
        if (action === "tui.select.confirm") return matchesKey(data, Key.enter);
        return false;
      },
      getKeys: () => [],
    } as unknown as KeybindingsManager;
    const ui = {
      notify: vi.fn(),
      onTerminalInput(handler: (data: string) => { consume?: boolean } | undefined) {
        terminalInputHandlers.push(handler);
        return () => {
          const index = terminalInputHandlers.indexOf(handler);
          if (index >= 0) terminalInputHandlers.splice(index, 1);
        };
      },
      custom<T>(
        factory: (
          tui: TuiMainScreen,
          theme: Theme,
          keybindings: KeybindingsManager,
          done: (result: T) => void,
        ) => DisposableComponent | Promise<DisposableComponent>,
        options?: { overlay?: boolean; overlayOptions?: OverlayOptions },
      ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
          let component: DisposableComponent | undefined;
          let closed = false;
          const done = (result: T) => {
            if (closed) return;
            closed = true;
            if (options?.overlay) tui.hideOverlay();
            resolve(result);
            component?.dispose?.();
          };
          Promise.resolve(factory(tui, theme, keybindings, done)).then((created) => {
            if (closed) {
              created.dispose?.();
              return;
            }
            component = created;
            components.push(created);
            if (options?.overlay) tui.showOverlay(created, options.overlayOptions);
            else tui.setFocus(created);
          }, reject);
        });
      },
    };
    const ctx = {
      mode: "tui",
      ui,
    } as unknown as ExtensionCommandContext;
    const pi = createPiMock();
    const registry = registerAgentsCommand(pi as never);
    registry.register({
      metadata: {
        runKey: "nested-input-run",
        taskId: "nested input test",
        kind: "Agent",
        label: "Agent",
        cwd: "/tmp",
        modelId: "test/model",
        thinkingLevel: "off",
        tools: [],
        startedAt: Date.now(),
      },
      handle: {
        result: new Promise(() => {}),
        steeringAvailable: true,
        subscribe(listener) {
          listener({ status: "running", turns: 0, toolUses: 0, toolErrors: 0 });
          return () => undefined;
        },
        steer: vi.fn(async () => "accepted" as const),
        stop: vi.fn(async () => undefined),
      },
    });
    const command = pi.commands.get("agents") as {
      handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
    };
    const viewerPromise = command.handler("", ctx);

    await vi.waitFor(() => expect(tui.hasOverlay()).toBe(true));
    const viewer = components[0] as InputComponent;
    viewer.handleInput("\r");
    viewer.handleInput("s");
    expect(viewer.render(100).join("\n")).toContain("Steer nested input test");

    const form = ui.custom((_screen, _theme, _keybindings, done) => new AskUserOverlay(done), {
      overlay: true,
    });
    await vi.waitFor(() => expect(tui.getFocusedComponent()).toBe(components[1]));
    tui.getFocusedComponent()?.handleInput?.("\u001b");
    await expect(form).resolves.toEqual({ kind: "cancel" });
    expect(tui.getFocusedComponent()).toBe(viewer);
    expect(tui.hasOverlay()).toBe(true);
    expect(terminalInputHandlers).toHaveLength(0);

    viewer.handleInput("\u001b");
    expect(viewer.render(100).join("\n")).toContain("Control canceled");
    expect(tui.hasOverlay()).toBe(true);

    viewer.handleInput("x");
    expect(viewer.render(100).join("\n")).toContain("Press Enter or y to confirm");
    viewer.handleInput("\u001b");
    expect(viewer.render(100).join("\n")).toContain("Stop canceled");
    expect(tui.hasOverlay()).toBe(true);

    viewer.handleInput("\u001b");
    expect(tui.hasOverlay()).toBe(true);
    viewer.handleInput("\u001b");
    await viewerPromise;
    expect(tui.hasOverlay()).toBe(false);
    expect(terminalInputHandlers).toHaveLength(0);
    await pi.emit("session_shutdown", { reason: "quit" });
  });
});

function makeTerminal(): Terminal {
  return {
    get columns() {
      return 80;
    },
    get rows() {
      return 24;
    },
    get kittyProtocolActive() {
      return false;
    },
    start() {},
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
  };
}
