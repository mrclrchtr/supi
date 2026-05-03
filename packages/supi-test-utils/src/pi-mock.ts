import { vi } from "vitest";

/**
 * A configurable mock of the pi ExtensionAPI for extension unit tests.
 * Captures registered handlers, commands, tools, and renderers in Maps/arrays
 * so tests can assert on what the extension wired up.
 */
export function createPiMock(): PiMock {
  const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
  const commands = new Map<string, unknown>();
  const tools: Array<unknown> = [];
  const renderers = new Map<string, unknown>();
  const entries: Array<{ type: string; data: unknown }> = [];

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

    appendEntry: vi.fn((type: string, data: unknown) => {
      entries.push({ type, data });
    }),

    handlers,
    commands,
    tools,
    renderers,
    entries,
  } as unknown as PiMock;
}

export interface PiMock {
  on: (event: string, handler: (...args: unknown[]) => unknown) => void;
  registerCommand: (name: string, spec: unknown) => void;
  registerTool: (tool: unknown) => void;
  registerMessageRenderer: (type: string, renderer: unknown) => void;
  appendEntry: (type: string, data: unknown) => void;
  handlers: Map<string, Array<(...args: unknown[]) => unknown>>;
  commands: Map<string, unknown>;
  tools: Array<unknown>;
  renderers: Map<string, unknown>;
  entries: Array<{ type: string; data: unknown }>;
}

/**
 * A minimal mock of the pi handler context object.
 * Tests can spread overrides to inject custom behavior.
 */
export function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    cwd: "/project",
    ui: {
      setStatus: vi.fn(),
      notify: vi.fn(),
      theme: { accent: "cyan", dim: "gray", error: "red", warning: "yellow", success: "green" },
    },
    sessionManager: {
      getBranch: vi.fn(() => []),
    },
    ...overrides,
  };
}
