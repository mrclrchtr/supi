import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, AssistantMessage, Model } from "@earendil-works/pi-ai";
import {
  type ExtensionCommandContext,
  SessionManager,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  type Component,
  getKeybindings,
  type KeybindingsManager,
  type OverlayOptions,
  type TUI,
} from "@earendil-works/pi-tui";
import {
  configureDebugRegistry,
  DEBUG_EVENT_ENTRY_TYPE,
  resetDebugRegistry,
  subscribeDebugEvents,
} from "@mrclrchtr/supi-core/debug";
import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { vi } from "vitest";
import extension from "../../src/extension.ts";

export const IMPROVER_MODEL: Model<Api> = {
  id: "improver-test-model",
  name: "Improver test model",
  api: "openai-completions",
  provider: "test-provider",
  baseUrl: "https://provider.example/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 32_000,
  maxTokens: 2_048,
};

export class FakeEditor {
  focused = false;
  onEscape?: () => void;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  private text = "";

  render(): string[] {
    return this.text.split("\n");
  }

  invalidate(): void {}

  getText(): string {
    return this.text;
  }

  getExpandedText(): string {
    return this.text;
  }

  setText(value: string): void {
    this.text = value;
  }

  handleInput(data: string): void {
    if (data === "\u001b") {
      this.onEscape?.();
      return;
    }
    if (data === "\r") {
      const value = this.text;
      this.text = "";
      this.onChange?.("");
      this.onSubmit?.(value);
      return;
    }
    if (data === "\u007f") {
      this.text = this.text.slice(0, -1);
      this.onChange?.(this.text);
      return;
    }
    this.text += data;
    this.onChange?.(this.text);
  }
}

interface DisposableComponent extends Component {
  dispose?(): void;
}

export interface CommandHarnessOptions {
  responses?: Array<AssistantMessage | (() => Promise<AssistantMessage>)>;
  contextFiles?: Array<{ path: string; content: string }>;
  projection?: unknown;
  editorText?: string;
  configuredModel?: string;
  terminalRows?: number;
  terminalColumns?: number;
  useDefaultEditor?: boolean;
  onRequestStart?: () => void;
  captureDebug?: boolean;
  persistDebugEvents?: boolean;
}

export interface CommandHarness {
  cwd: string;
  pi: ReturnType<typeof createPiMock>;
  ctx: ExtensionCommandContext;
  getSessionManager(): SessionManager;
  replaceSession(): void;
  appendRealSessionEntry(type?: string): void;
  readPersistedSession(manager?: SessionManager): Array<Record<string, unknown>>;
  handler: (args: string) => Promise<void>;
  interactions: Array<{
    component: Component;
    overlay: boolean | undefined;
    overlayOptions?: OverlayOptions;
  }>;
  editors: FakeEditor[];
  requestContexts: Array<unknown>;
  requestSignals: Array<AbortSignal | undefined>;
  notifications: Array<{ message: string; type?: string }>;
  getEditorText(): string;
  setEditorText(text: string): void;
  setPendingMessages(value: boolean): void;
  setCustomDriver(driver: (component: Component, index: number) => void): void;
  setTerminalSize(rows: number, columns: number): void;
  renderOverlay(index: number): string[];
  cleanup(): void;
}

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;
const keybindings = getKeybindings();

export function makeAssistantMessage(
  response: unknown,
  stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: JSON.stringify(response) }],
    api: IMPROVER_MODEL.api,
    provider: IMPROVER_MODEL.provider,
    model: IMPROVER_MODEL.id,
    usage: {
      input: 10,
      output: 10,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 20,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    timestamp: Date.now(),
  };
}

export function createCommandHarness(options: CommandHarnessOptions = {}): CommandHarness {
  const cwd = mkdtempSync(join(tmpdir(), "supi-prompt-improver-"));
  mkdirSync(join(cwd, ".pi", "supi"), { recursive: true });
  writeFileSync(
    join(cwd, ".pi", "settings.json"),
    `${JSON.stringify({ enabledModels: [`${IMPROVER_MODEL.provider}/${IMPROVER_MODEL.id}`] })}\n`,
  );
  writeFileSync(
    join(cwd, ".pi", "supi", "config.json"),
    `${JSON.stringify({ promptImprover: { model: options.configuredModel ?? `${IMPROVER_MODEL.provider}/${IMPROVER_MODEL.id}` } })}\n`,
  );

  let editorText = options.editorText ?? "post-command baseline";
  let idle = true;
  let pending = false;
  let sessionCounter = 1;
  let sessionManager = SessionManager.create(cwd, join(cwd, "sessions"));
  sessionManager.appendCustomEntry("test-seed", {});
  sessionManager.appendMessage(makeAssistantMessage({ kind: "test-seed" }));
  let unsubscribeDebugEvents: (() => void) | undefined;
  resetDebugRegistry();
  configureDebugRegistry({
    enabled: options.captureDebug === true || options.persistDebugEvents === true,
    agentAccess: "sanitized",
  });
  let customDriver = (_component: Component, _index: number) => {};
  const interactions: CommandHarness["interactions"] = [];
  const editors: FakeEditor[] = [];
  const terminal = {
    rows: options.terminalRows ?? 40,
    columns: options.terminalColumns ?? 100,
  };
  const tui = { terminal, requestRender() {} } as TUI;
  const requestContexts: unknown[] = [];
  const requestSignals: Array<AbortSignal | undefined> = [];
  const notifications: Array<{ message: string; type?: string }> = [];
  const responses = [...(options.responses ?? [])];
  const projection = options.projection ?? { entries: [], messages: [] };

  const modelRegistry = {
    getAvailable: () => [IMPROVER_MODEL],
    streamSimple: vi.fn(
      (_model: Model<Api>, context: unknown, requestOptions: { signal?: AbortSignal }) => {
        options.onRequestStart?.();
        requestContexts.push(context);
        requestSignals.push(requestOptions.signal);
        const next = responses.shift();
        return {
          result: () =>
            typeof next === "function"
              ? next()
              : Promise.resolve(next ?? makeAssistantMessage({ kind: "unchanged" })),
        };
      },
    ),
  };

  const ui = {
    getEditorText: () => editorText,
    setEditorText: (text: string) => {
      editorText = text;
    },
    notify: (message: string, type?: string) => notifications.push({ message, type }),
    getEditorComponent: () => {
      if (options.useDefaultEditor) return undefined;
      return (_tui: TUI, _editorTheme: unknown, _kb: KeybindingsManager) => {
        const editor = new FakeEditor();
        editors.push(editor);
        return editor;
      };
    },
    custom: async <T>(
      factory: (
        tui: TUI,
        theme: Theme,
        keybindings: KeybindingsManager,
        done: (result: T) => void,
      ) => Component,
      customOptions?: { overlay?: boolean; overlayOptions?: OverlayOptions },
    ) =>
      await new Promise<T>((resolve, reject) => {
        let component: DisposableComponent | undefined;
        let completed = false;
        let disposed = false;
        const dispose = () => {
          if (disposed || !component) return;
          disposed = true;
          component.dispose?.();
        };
        const done = (result: T) => {
          if (completed) return;
          completed = true;
          resolve(result);
          dispose();
        };
        try {
          component = factory(tui, theme, keybindings, done) as DisposableComponent;
          const index = interactions.length;
          interactions.push({
            component,
            overlay: customOptions?.overlay,
            overlayOptions: customOptions?.overlayOptions,
          });
          if (completed) dispose();
          customDriver(component, index);
        } catch (error) {
          dispose();
          reject(error);
        }
      }),
  };

  const ctx = {
    mode: "tui",
    hasUI: true,
    cwd,
    ui,
    model: undefined,
    modelRegistry,
    isIdle: () => idle,
    hasPendingMessages: () => pending,
    signal: undefined,
    sessionManager: {
      getSessionId: () => sessionManager.getSessionId(),
      getLeafId: () => sessionManager.getLeafId(),
      getBranch: () => sessionManager.getBranch(),
      buildSessionProjection: () => projection,
    },
    getSystemPromptOptions: () => ({
      cwd,
      contextFiles: options.contextFiles ?? [],
      customPrompt: "This full prompt must not enter the feature request.",
    }),
  } as unknown as ExtensionCommandContext;

  const pi = createPiMock();
  if (options.persistDebugEvents) {
    vi.mocked(pi.appendEntry).mockImplementation((type, data) => {
      sessionManager.appendCustomEntry(type, data);
    });
    unsubscribeDebugEvents = subscribeDebugEvents((event) => {
      pi.appendEntry(DEBUG_EVENT_ENTRY_TYPE, event);
    });
  }
  extension(pi as never);
  const registered = pi.commands.get("supi-improve") as {
    handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  };

  return {
    cwd,
    pi,
    ctx,
    getSessionManager: () => sessionManager,
    replaceSession: () => {
      sessionCounter += 1;
      sessionManager = SessionManager.create(cwd, join(cwd, `sessions-${sessionCounter}`));
      sessionManager.appendCustomEntry("test-seed", {});
      sessionManager.appendMessage(makeAssistantMessage({ kind: "test-seed" }));
    },
    appendRealSessionEntry: (type = "user-change") => {
      sessionManager.appendCustomEntry(type, { changed: true });
    },
    readPersistedSession: (manager = sessionManager) => {
      const sessionFile = manager.getSessionFile();
      if (!sessionFile) throw new Error("The test session has no file.");
      return readFileSync(sessionFile, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
    handler: (args) => registered.handler(args, ctx),
    interactions,
    editors,
    requestContexts,
    requestSignals,
    notifications,
    getEditorText: () => editorText,
    setEditorText: (text) => {
      editorText = text;
    },
    setPendingMessages: (value) => {
      pending = value;
    },
    setCustomDriver: (driver) => {
      customDriver = driver;
    },
    setTerminalSize: (rows, columns) => {
      terminal.rows = rows;
      terminal.columns = columns;
    },
    renderOverlay: (index) => {
      const interaction = interactions[index];
      if (!interaction) throw new Error(`Missing interaction ${index}.`);
      const options = interaction.overlayOptions ?? {};
      const margin = normalizeMargin(options.margin);
      const height = clampSize(
        requestedSize(options.maxHeight, terminal.rows, terminal.rows),
        terminal.rows,
        margin.top ?? 0,
        margin.bottom ?? 0,
      );
      const width = clampSize(
        requestedSize(options.width, terminal.columns, Math.min(80, terminal.columns)),
        terminal.columns,
        margin.left ?? 0,
        margin.right ?? 0,
      );
      return interaction.component.render(width).slice(0, height);
    },
    cleanup: () => {
      unsubscribeDebugEvents?.();
      unsubscribeDebugEvents = undefined;
      resetDebugRegistry();
      rmSync(cwd, { recursive: true, force: true });
      idle = false;
      pending = true;
    },
  };
}

type MarginEdges = { top?: number; right?: number; bottom?: number; left?: number };

function normalizeMargin(margin: OverlayOptions["margin"]): MarginEdges {
  if (typeof margin !== "number") return margin ?? {};
  return { top: margin, right: margin, bottom: margin, left: margin };
}

function requestedSize(
  value: OverlayOptions["maxHeight"],
  total: number,
  fallback: number,
): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Math.floor((total * Number.parseFloat(value)) / 100);
  return fallback;
}

function clampSize(requested: number, total: number, before: number, after: number): number {
  return Math.max(1, Math.min(requested, total - before - after));
}

export function interact(component: Component, data: string): void {
  component.handleInput?.(data);
}
