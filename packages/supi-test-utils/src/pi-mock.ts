import { vi } from "vitest";

/**
 * A configurable mock of the pi ExtensionAPI for extension unit tests.
 * Captures registered handlers, commands, tools, renderers, shortcuts, etc.
 * in Maps/arrays so tests can assert on what the extension wired up.
 */
export function createPiMock(options: PiMockOptions = {}): PiMock {
  const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
  const commands = new Map<string, unknown>();
  const tools: Array<unknown> = [];
  const renderers = new Map<string, unknown>();
  const entries: Array<{ type: string; data: unknown }> = [];
  const messages: Array<Record<string, unknown>> = [];
  const shortcuts = new Map<string, Array<(ctx: unknown) => unknown>>();
  const execCalls: Array<{ command: string; args: string[] }> = [];
  const eventBusHandlers = new Map<string, Array<(data: unknown) => void>>();
  let activeTools: string[] = [];

  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    }),

    registerCommand: vi.fn((name: string, spec: unknown) => {
      commands.set(name, spec);
    }),

    registerTool: vi.fn((tool: unknown) => {
      tools.push(tool);
    }),

    registerMessageRenderer: vi.fn((type: string, renderer: unknown) => {
      renderers.set(type, renderer);
    }),

    registerShortcut: vi.fn((key: string, opts: { handler: (ctx: unknown) => unknown }) => {
      const list = shortcuts.get(key) ?? [];
      list.push(opts.handler);
      shortcuts.set(key, list);
    }),

    appendEntry: vi.fn((type: string, data: unknown) => {
      entries.push({ type, data });
    }),

    sendMessage: vi.fn((message: Record<string, unknown>) => {
      messages.push(message);
    }),

    getSessionName: vi.fn(() => options.sessionName),

    getActiveTools: vi.fn(() => activeTools),

    setActiveTools: vi.fn((tools: string[]) => {
      activeTools = tools;
    }),

    getAllTools: vi.fn(() => tools),

    exec: vi.fn(async (_command: string, _args: string[]) => {
      execCalls.push({ command: _command, args: _args });
      return { code: 0, stdout: "", stderr: "" };
    }),

    events: {
      on: vi.fn((channel: string, handler: (data: unknown) => void) => {
        const list = eventBusHandlers.get(channel) ?? [];
        list.push(handler);
        eventBusHandlers.set(channel, list);
        return () => {
          const idx = list.indexOf(handler);
          if (idx !== -1) list.splice(idx, 1);
        };
      }),
      emit: vi.fn((channel: string, data: unknown) => {
        for (const handler of eventBusHandlers.get(channel) ?? []) {
          handler(data);
        }
      }),
    },

    emit: async (event: string, ...args: unknown[]) => {
      const eventHandlers = handlers.get(event);
      if (!eventHandlers) return;
      for (const handler of eventHandlers) {
        await handler(...args);
      }
    },

    handlers,
    commands,
    tools,
    renderers,
    entries,
    messages,
    shortcuts,
    execCalls,

    getHandlers: (event: string) => handlers.get(event) ?? [],
    getCommandHandler: (name: string) => {
      const spec = commands.get(name);
      return spec && typeof spec === "object" && "handler" in (spec as Record<string, unknown>)
        ? (spec as Record<string, unknown>).handler
        : spec;
    },
    getShortcutHandlers: (key: string) => shortcuts.get(key) ?? [],
    getExecCalls: () => execCalls,
  } as unknown as PiMock;
}

export interface PiMockOptions {
  /** Value returned by `getSessionName()`. */
  sessionName?: string;
}

export interface PiMock {
  on: (event: string, handler: (...args: unknown[]) => unknown) => void;
  registerCommand: (name: string, spec: unknown) => void;
  registerTool: (tool: unknown) => void;
  registerMessageRenderer: (type: string, renderer: unknown) => void;
  registerShortcut: (key: string, opts: { handler: (ctx: unknown) => unknown }) => void;
  appendEntry: (type: string, data: unknown) => void;
  sendMessage: (message: Record<string, unknown>) => void;
  getSessionName: () => string | undefined;
  getActiveTools: () => string[];
  setActiveTools: (tools: string[]) => void;
  getAllTools: () => Array<unknown>;
  emit: (event: string, ...args: unknown[]) => Promise<void>;
  exec: (
    command: string,
    args: string[],
  ) => Promise<{ code: number; stdout: string; stderr: string }>;
  events: {
    on: (channel: string, handler: (data: unknown) => void) => () => void;
    emit: (channel: string, data: unknown) => void;
  };
  handlers: Map<string, Array<(...args: unknown[]) => unknown>>;
  commands: Map<string, unknown>;
  tools: Array<unknown>;
  renderers: Map<string, unknown>;
  entries: Array<{ type: string; data: unknown }>;
  messages: Array<Record<string, unknown>>;
  shortcuts: Map<string, Array<(ctx: unknown) => unknown>>;
  execCalls: Array<{ command: string; args: string[] }>;
  getHandlers: (event: string) => Array<(...args: unknown[]) => unknown>;
  getCommandHandler: (name: string) => unknown;
  getShortcutHandlers: (key: string) => Array<(ctx: unknown) => unknown>;
  getExecCalls: () => Array<{ command: string; args: string[] }>;
}

/**
 * A minimal mock of the pi handler context object.
 * Tests can spread overrides to inject custom behavior.
 *
 * @example
 * ```ts
 * const ctx = makeCtx({ cwd: "/test" });
 * const ctx = makeCtx({ getContextUsage: () => ({ tokens: 1000, contextWindow: 100000, percent: 1 }) });
 * ```
 */
export function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    cwd: "/project",
    model: { provider: "openai", id: "gpt-4", name: "GPT-4" },
    ui: {
      setStatus: vi.fn(),
      notify: vi.fn(),
      setTitle: vi.fn(),
      setWidget: vi.fn(),
      removeWidget: vi.fn(),
      getEditorText: vi.fn(() => ""),
      setEditorText: vi.fn(),
      input: vi.fn(async () => undefined as string | undefined),
      custom: vi.fn(async () => null as unknown),
      theme: {
        accent: "cyan",
        dim: "gray",
        error: "red",
        warning: "yellow",
        success: "green",
        fg: (_color: string, text: string) => text,
        bg: (_color: string, text: string) => text,
        bold: (text: string) => text,
      },
    },
    sessionManager: {
      getBranch: vi.fn(() => []),
    },
    getContextUsage: vi.fn(
      () =>
        undefined as
          | { tokens: number | null; contextWindow: number; percent: number | null }
          | undefined,
    ),
    getSystemPrompt: vi.fn(() => "System"),
    ...overrides,
  };
}
