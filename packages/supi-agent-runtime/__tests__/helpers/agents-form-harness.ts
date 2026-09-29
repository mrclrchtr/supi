import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionUIContext,
  KeybindingsManager,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Container,
  Key,
  matchesKey,
  type Terminal,
  type TUI,
  TuiMainScreen,
} from "@earendil-works/pi-tui";
import askUserExtension from "@mrclrchtr/supi-ask-user/extension";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { vi } from "vitest";
import { registerAgentsCommand } from "../../src/api.ts";

type DisposableComponent = Component & { dispose?(): void };
type ScreenFactory<T> = (
  tui: TUI,
  theme: Theme,
  keybindings: KeybindingsManager,
  done: (result: T) => void,
) => DisposableComponent | Promise<DisposableComponent>;

const questionnaire = {
  questions: [
    {
      type: "choice",
      id: "formatter",
      header: "Formatter",
      prompt: "Which formatter should I use?",
      options: [
        { value: "biome", label: "Biome" },
        { value: "prettier", label: "Prettier" },
      ],
    },
  ],
};

/** Use the real command, tool, and TUI with Pi's custom-screen mount and close order. */
export async function createAgentsFormHarness() {
  const pi = createPiMock();
  const base = makeCtx();
  const tui = new TuiMainScreen(makeTerminal());
  tui.requestRender = vi.fn();
  const screens = createCustomScreens(tui, base.ui.theme as unknown as Theme);
  const abort = vi.fn();
  const ctx = {
    ...base,
    hasUI: true,
    abort,
    sessionManager: { ...base.sessionManager, getSessionId: () => "agents-form-test" },
    ui: {
      ...base.ui,
      custom: screens.custom,
      getEditorComponent: () => undefined,
      setWorkingVisible: vi.fn(),
      onTerminalInput: (listener: Parameters<ExtensionUIContext["onTerminalInput"]>[0]) =>
        tui.addInputListener(listener),
    },
  } as unknown as ExtensionCommandContext;
  registerAgentsCommand(pi as unknown as ExtensionAPI);
  askUserExtension(pi as unknown as ExtensionAPI);
  await pi.emit("session_start", { reason: "startup" }, ctx);
  const command = pi.commands.get("agents") as {
    handler(args: string, ctx: ExtensionCommandContext): Promise<void>;
  };
  const controller = new AbortController();
  return {
    pi,
    ctx,
    tui,
    abort,
    screens: screens.components,
    openViewer: () => command.handler("", ctx),
    startForm: () => {
      const result = getTool(pi, "ask_user").execute(
        "form-test",
        questionnaire,
        controller.signal,
        undefined,
        ctx,
      );
      // Cleanup can cancel a form after an assertion fails.
      void result.catch(() => undefined);
      return result;
    },
    async cleanup() {
      controller.abort();
      screens.closeAll();
      await pi.emit("session_shutdown", { reason: "quit" }, ctx);
    },
  };
}

function createCustomScreens(tui: TuiMainScreen, theme: Theme) {
  const editor = { render: () => ["Main editor"], invalidate() {} };
  const editorContainer = new Container();
  editorContainer.addChild(editor);
  tui.addChild(editorContainer);
  tui.setFocus(editor);
  const components: DisposableComponent[] = [];
  const closeScreens: Array<() => void> = [];
  const keybindings = {
    matches: (data: string, action: string) => {
      if (action === "app.interrupt") return matchesKey(data, Key.escape);
      if (action === "tui.select.cancel") return matchesKey(data, Key.ctrl("c"));
      if (action === "tui.select.confirm") return matchesKey(data, Key.enter);
      return false;
    },
    getKeys: () => [],
  } as unknown as KeybindingsManager;
  const custom = <T>(
    factory: ScreenFactory<T>,
    options?: Parameters<ExtensionUIContext["custom"]>[1],
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      let component: DisposableComponent | undefined;
      let closed = false;
      const done = (result: T) => {
        if (closed) return;
        closed = true;
        if (options?.overlay) tui.hideOverlay();
        else {
          editorContainer.clear();
          editorContainer.addChild(editor);
          tui.setFocus(editor);
        }
        resolve(result);
        component?.dispose?.();
      };
      closeScreens.push(() => done(undefined as T));
      Promise.resolve(factory(tui, theme, keybindings, done))
        .then((created) => {
          // Pi does not mount a screen that completed before its factory resolved.
          if (closed) return;
          component = created;
          components.push(created);
          if (options?.overlay) {
            const bounds =
              typeof options.overlayOptions === "function"
                ? options.overlayOptions()
                : options.overlayOptions;
            const handle = tui.showOverlay(created, bounds);
            options.onHandle?.(handle);
          } else {
            editorContainer.clear();
            editorContainer.addChild(created);
            tui.setFocus(created);
          }
        })
        .catch(reject);
    });
  return {
    custom,
    components,
    closeAll: () => {
      for (const close of [...closeScreens].reverse()) close();
    },
  };
}

function makeTerminal(): Terminal {
  return {
    columns: 100,
    rows: 40,
    kittyProtocolActive: false,
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
