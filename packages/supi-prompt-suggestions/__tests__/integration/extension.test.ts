import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const mockRegisterSettings = vi.hoisted(() => vi.fn());
const mockGeneratorStart = vi.hoisted(() => vi.fn());
const mockGeneratorDismiss = vi.hoisted(() => vi.fn());
const mockEditorSetSuggestion = vi.hoisted(() => vi.fn());
const mockEditorClearGhost = vi.hoisted(() => vi.fn());
const mockEditorAddToHistory = vi.hoisted(() => vi.fn());
const mockSpinnerStart = vi.hoisted(() => vi.fn());
const mockSpinnerStop = vi.hoisted(() => vi.fn());

const mockGhostTextEditor = vi.hoisted(
  () =>
    class {
      setSuggestion = mockEditorSetSuggestion;
      clearGhost = mockEditorClearGhost;
      addToHistory = mockEditorAddToHistory;
    },
);

const mockSuggestionGenerator = vi.hoisted(
  () =>
    class {
      start = mockGeneratorStart;
      dismiss = mockGeneratorDismiss;
    },
);

const mockStatusSpinner = vi.hoisted(
  () =>
    class {
      start = mockSpinnerStart;
      stop = mockSpinnerStop;
    },
);

vi.mock("../../src/config/settings.ts", () => ({
  registerPromptSuggestionsSettings: mockRegisterSettings,
}));

vi.mock("../../src/editor/editor.ts", () => ({
  GhostTextEditor: mockGhostTextEditor,
}));

vi.mock("../../src/generation/generator.ts", () => ({
  SuggestionGenerator: mockSuggestionGenerator,
}));

vi.mock("@mrclrchtr/supi-core/api", () => ({
  StatusSpinner: mockStatusSpinner,
}));

import extension from "../../src/extension.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

function setup() {
  const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
  let editorFactory: ((...args: unknown[]) => unknown) | null = null;

  const pi = {
    on(event: string, handler: (...args: unknown[]) => unknown) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  };

  const ctx = {
    cwd: "/fake/project",
    ui: {
      setEditorComponent: vi.fn((factory: (...args: unknown[]) => unknown) => {
        editorFactory = factory;
      }),
      getEditorText: vi.fn(() => ""),
      setStatus: vi.fn(),
    },
    sessionManager: {
      getEntries: vi.fn(() => []),
    },
  };

  extension(pi as never);

  return { handlers, ctx, editorFactory };
}

function getHandler(
  handlers: Map<string, Array<(...args: unknown[]) => unknown>>,
  event: string,
): (...args: unknown[]) => unknown {
  const list = handlers.get(event);
  if (!list || list.length === 0) {
    throw new Error(`No handler registered for event "${event}"`);
  }
  return list[0];
}

function makeAgentEndEvent(text: string) {
  return {
    messages: [
      { role: "user", content: [{ type: "text", text: "hello" }] },
      {
        role: "assistant",
        content: [{ type: "text", text }],
      },
    ],
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("supi-prompt-suggestions extension lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Handler registration ──────────────────────────────────

  it("registers settings on load", () => {
    setup();
    expect(mockRegisterSettings).toHaveBeenCalled();
  });

  it("registers session_start handler", () => {
    const { handlers } = setup();
    expect(handlers.has("session_start")).toBe(true);
  });

  it("registers agent_end handler", () => {
    const { handlers } = setup();
    expect(handlers.has("agent_end")).toBe(true);
  });

  it("registers agent_start handler", () => {
    const { handlers } = setup();
    expect(handlers.has("agent_start")).toBe(true);
  });

  it("registers session_shutdown handler", () => {
    const { handlers } = setup();
    expect(handlers.has("session_shutdown")).toBe(true);
  });

  // ── session_start ─────────────────────────────────────────

  it("installs editor on session_start", () => {
    const { handlers, ctx } = setup();
    const handler = getHandler(handlers, "session_start");

    handler({}, ctx);

    expect(ctx.ui.setEditorComponent).toHaveBeenCalled();
  });

  it("seeds editor history from session entries on session_start", () => {
    const { handlers, ctx } = setup();
    const userMessage = { type: "text", text: "previous user message" };
    (ctx.sessionManager.getEntries as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        type: "message",
        message: { role: "user", content: [userMessage] },
      },
    ]);

    const handler = getHandler(handlers, "session_start");
    handler({}, ctx);

    // Call the editor factory to trigger the GhostTextEditor constructor
    const factoryFn = (ctx.ui.setEditorComponent as ReturnType<typeof vi.fn>).mock.calls[0][0];
    factoryFn();

    expect(mockEditorAddToHistory).toHaveBeenCalledWith("previous user message");
  });

  // ── agent_end → suggestion generation ─────────────────────

  it("starts suggestion generation on agent_end with assistant text", () => {
    const { handlers, ctx } = setup();
    // Simulate session_start first to initialize spinner + editor
    const startHandler = getHandler(handlers, "session_start");
    startHandler({}, ctx);

    const endHandler = getHandler(handlers, "agent_end");
    endHandler(makeAgentEndEvent("The bug is in the parser module."), ctx);

    expect(mockGeneratorStart).toHaveBeenCalled();
  });

  it("skips generation when last assistant text is empty", () => {
    const { handlers, ctx } = setup();
    const startHandler = getHandler(handlers, "session_start");
    startHandler({}, ctx);

    const endHandler = getHandler(handlers, "agent_end");
    endHandler(makeAgentEndEvent("   "), ctx);

    expect(mockGeneratorStart).not.toHaveBeenCalled();
  });

  // ── agent_start → clear ghost ─────────────────────────────

  it("dismisses generator and clears ghost on agent_start", () => {
    const { handlers, ctx } = setup();
    const startHandler = getHandler(handlers, "session_start");
    startHandler({}, ctx);

    // Set up an editor so clearGhost can work
    const factoryFn = (ctx.ui.setEditorComponent as ReturnType<typeof vi.fn>).mock.calls[0][0];
    factoryFn();

    const agentStartHandler = getHandler(handlers, "agent_start");
    agentStartHandler({}, ctx);

    expect(mockGeneratorDismiss).toHaveBeenCalled();
    expect(mockEditorClearGhost).toHaveBeenCalled();
    expect(mockSpinnerStop).toHaveBeenCalled();
  });

  // ── session_shutdown → cleanup ────────────────────────────

  it("cleans up on session_shutdown", () => {
    const { handlers, ctx } = setup();
    const startHandler = getHandler(handlers, "session_start");
    startHandler({}, ctx);

    const factoryFn = (ctx.ui.setEditorComponent as ReturnType<typeof vi.fn>).mock.calls[0][0];
    factoryFn();

    const shutdownHandler = getHandler(handlers, "session_shutdown");
    shutdownHandler();

    expect(mockGeneratorDismiss).toHaveBeenCalled();
    expect(mockEditorClearGhost).toHaveBeenCalled();
    expect(mockSpinnerStop).toHaveBeenCalled();
  });
});
