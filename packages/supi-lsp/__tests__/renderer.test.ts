import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  loadLspSettings: vi.fn(() => ({ enabled: true, severity: 1, servers: [] })),
  pruneAndReorderContextMessages: vi.fn((msgs: unknown) => msgs),
  buildProjectGuidelines: vi.fn(() => []),
  diagnosticsContextFingerprint: vi.fn(),
  formatDiagnosticsContext: vi.fn(),
  lspPromptGuidelines: [],
  lspPromptSnippet: "",
  LspManager: vi.fn(),
  registerLspAwareToolOverrides: vi.fn(),
  registerLspSettings: vi.fn(),
  introspectCapabilities: vi.fn(() => []),
  scanProjectCapabilities: vi.fn(() => []),
  startDetectedServers: vi.fn(),
  toggleLspStatusOverlay: vi.fn(),
  updateLspUi: vi.fn(),
  executeAction: vi.fn(),
}));

vi.mock("../config.ts", () => ({
  loadConfig: mockFns.loadConfig,
}));

vi.mock("../guidance.ts", () => ({
  buildProjectGuidelines: mockFns.buildProjectGuidelines,
  diagnosticsContextFingerprint: mockFns.diagnosticsContextFingerprint,
  formatDiagnosticsContext: mockFns.formatDiagnosticsContext,
  lspPromptGuidelines: mockFns.lspPromptGuidelines,
  lspPromptSnippet: mockFns.lspPromptSnippet,
  MAX_DETAILED_DIAGNOSTICS: 5,
}));

vi.mock("@mrclrchtr/supi-core", () => ({
  getContextToken: (details: unknown) =>
    details && typeof details === "object"
      ? ((details as { contextToken?: string }).contextToken ?? null)
      : null,
  pruneAndReorderContextMessages: mockFns.pruneAndReorderContextMessages,
  restorePromptContent(
    messages: Array<{ customType?: string; content?: unknown; details?: unknown }>,
    customType: string,
    activeToken: string | null,
  ) {
    if (!activeToken) return messages;
    const getContextToken = (d: unknown): string | null => {
      if (!d || typeof d !== "object") return null;
      const t = (d as { contextToken?: unknown }).contextToken;
      return typeof t === "string" ? t : null;
    };
    const getPromptContent = (d: unknown): string | null => {
      if (!d || typeof d !== "object") return null;
      const p = (d as { promptContent?: unknown }).promptContent;
      return typeof p === "string" ? p : null;
    };
    const idx = messages.findIndex(
      (m) => m.customType === customType && getContextToken(m.details) === activeToken,
    );
    if (idx === -1) return messages;
    const pc = getPromptContent(messages[idx]?.details);
    if (!pc || messages[idx]?.content === pc) return messages;
    const next = [...messages];
    next[idx] = { ...next[idx], content: pc };
    return next;
  },
}));

vi.mock("../manager.ts", () => ({
  LspManager: mockFns.LspManager,
}));

vi.mock("../settings-registration.ts", () => ({
  loadLspSettings: mockFns.loadLspSettings,
  registerLspSettings: mockFns.registerLspSettings,
}));

vi.mock("../overrides.ts", () => ({
  registerLspAwareToolOverrides: mockFns.registerLspAwareToolOverrides,
}));

vi.mock("../scanner.ts", () => ({
  introspectCapabilities: mockFns.introspectCapabilities,
  scanProjectCapabilities: mockFns.scanProjectCapabilities,
  startDetectedServers: mockFns.startDetectedServers,
}));

vi.mock("../ui.ts", () => ({
  toggleLspStatusOverlay: mockFns.toggleLspStatusOverlay,
  updateLspUi: mockFns.updateLspUi,
}));

vi.mock("../tool-actions.ts", () => ({
  executeAction: mockFns.executeAction,
  lspToolDescription: "",
}));

vi.mock("../tree-persist.ts", () => ({
  persistLspActiveState: vi.fn(),
  persistLspInactiveState: vi.fn(),
  registerTreePersistHandlers: vi.fn(),
}));

vi.mock("../manager-types.ts", () => ({}));

import lspExtension from "../lsp.ts";

function resetMocks() {
  vi.clearAllMocks();
  mockFns.loadConfig.mockReturnValue({ servers: {} });
  mockFns.loadLspSettings.mockReturnValue({ enabled: true, severity: 1, servers: [] });
  mockFns.pruneAndReorderContextMessages.mockImplementation((msgs: unknown) => msgs);
  mockFns.buildProjectGuidelines.mockReturnValue([]);
  mockFns.diagnosticsContextFingerprint.mockReturnValue(null);
  mockFns.formatDiagnosticsContext.mockReturnValue(null);
  mockFns.introspectCapabilities.mockReturnValue([]);
  mockFns.scanProjectCapabilities.mockReturnValue([]);
  mockFns.startDetectedServers.mockResolvedValue(undefined);
}

function createManager(diagnostics: unknown[] = []) {
  return {
    registerDetectedServers: vi.fn(),
    shutdownAll: vi.fn(),
    pruneMissingFiles: vi.fn(),
    getOutstandingDiagnosticSummary: vi.fn(() => diagnostics),
    getOutstandingDiagnostics: vi.fn(() => []),
  };
}

beforeEach(resetMocks);

// Capture registerMessageRenderer calls
function createPiWithRenderers() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const renderers = new Map<string, (...args: unknown[]) => unknown>();

  const pi = {
    on(event: string, handler: (...args: unknown[]) => unknown) {
      handlers.set(event, handler);
    },
    registerCommand() {},
    registerTool() {},
    registerMessageRenderer(customType: string, renderer: (...args: unknown[]) => unknown) {
      renderers.set(customType, renderer);
    },
    getActiveTools: () => ["lsp"] as string[],
    setActiveTools: vi.fn(),
    appendEntry: vi.fn(),
  } as never;

  return { handlers, renderers, pi };
}

// Theme mock that wraps text with color markers for assertions
function createTheme() {
  const fg = (color: string, text: string) => `[${color}]${text}[/${color}]`;
  const bg = (_color: string, text: string) => text;
  return { fg, bg };
}

type RenderOutputOptions = { expanded?: boolean; width?: number };

function renderLspMessage(details: unknown, options: RenderOutputOptions = {}): string {
  const { renderers, pi } = createPiWithRenderers();
  lspExtension(pi);

  const renderer = renderers.get("lsp-context");
  if (!renderer) throw new Error("lsp-context renderer was not registered");

  const result = renderer(
    {
      role: "custom" as const,
      customType: "lsp-context",
      content: "some content",
      display: true,
      details,
      timestamp: Date.now(),
    },
    { expanded: options.expanded ?? false },
    createTheme(),
  );

  return (result as { render: (w: number) => string[] }).render(options.width ?? 80).join("\n");
}

describe("lsp-context message renderer", () => {
  it("renders collapsed view with errors and warnings", () => {
    const output = renderLspMessage({
      contextToken: "lsp-context-5",
      inlineSeverity: 1,
      diagnostics: [
        { file: "manager.ts", errors: 2, warnings: 0, information: 0, hints: 0 },
        { file: "lsp.ts", errors: 0, warnings: 5, information: 0, hints: 0 },
      ],
    });

    expect(output).toContain("LSP diagnostics injected");
    expect(output).toContain("2 errors");
    expect(output).toContain("5 warnings");
  });

  it("renders collapsed view with information and hints", () => {
    const output = renderLspMessage(
      {
        contextToken: "lsp-context-5",
        inlineSeverity: 4,
        diagnostics: [{ file: "info.ts", errors: 0, warnings: 0, information: 3, hints: 1 }],
      },
      { width: 120 },
    );

    expect(output).toContain("LSP diagnostics injected");
    expect(output).toContain("3 infos");
    expect(output).toContain("1 hint");
    expect(output).not.toContain("[success]");
  });

  it("renders collapsed view with clean diagnostics", () => {
    const output = renderLspMessage({
      contextToken: "lsp-context-5",
      inlineSeverity: 1,
      diagnostics: [],
    });

    expect(output).toContain("LSP diagnostics injected");
    // Clean diagnostics show a success checkmark.
    // biome-ignore lint/security/noSecrets: false positive on checkmark test string
    expect(output).toContain("[success]\u2713[/success]");
  });

  it("renders expanded view with per-file breakdown and token", () => {
    const output = renderLspMessage(
      {
        contextToken: "lsp-context-5",
        inlineSeverity: 1,
        diagnostics: [
          { file: "manager.ts", errors: 2, warnings: 1, information: 0, hints: 0 },
          { file: "lsp.ts", errors: 0, warnings: 5, information: 3, hints: 0 },
        ],
      },
      { expanded: true },
    );

    expect(output).toContain("LSP diagnostics injected");
    expect(output).toContain("manager.ts");
    expect(output).toContain("lsp.ts");
    expect(output).toContain("token: lsp-context-5");
  });

  it("renders with missing details gracefully", () => {
    const output = renderLspMessage(undefined);

    expect(output).toContain("LSP diagnostics injected");
  });
});

describe("lsp-context before_agent_start message", () => {
  it("emits visible diagnostic details for the renderer without notifying", async () => {
    const diagnostics = [
      { file: "manager.ts", total: 2, errors: 2, warnings: 0, information: 0, hints: 0 },
      { file: "lsp.ts", total: 1, errors: 0, warnings: 1, information: 0, hints: 0 },
    ];
    const manager = createManager(diagnostics);
    mockFns.LspManager.mockImplementation(function LspManagerMock() {
      return manager;
    });
    mockFns.formatDiagnosticsContext.mockReturnValue(
      '<extension-context source="supi-lsp">\nOutstanding diagnostics\n</extension-context>',
    );
    mockFns.diagnosticsContextFingerprint.mockReturnValue("diagnostics-fp");

    const { handlers, pi } = createPiWithRenderers();
    lspExtension(pi);
    const ctx = { cwd: "/project", ui: { notify: vi.fn() } };

    await handlers.get("session_start")?.({}, ctx);
    const result = await handlers.get("before_agent_start")?.({}, ctx);

    expect(result).toEqual({
      message: {
        customType: "lsp-context",
        content: "LSP diagnostics injected (2 errors, 1 warning)",
        display: true,
        details: {
          contextToken: "lsp-context-1",
          promptContent:
            '<extension-context source="supi-lsp">\nOutstanding diagnostics\n</extension-context>',
          inlineSeverity: 1,
          diagnostics: [
            { file: "manager.ts", errors: 2, warnings: 0, information: 0, hints: 0 },
            { file: "lsp.ts", errors: 0, warnings: 1, information: 0, hints: 0 },
          ],
        },
      },
    });
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it("restores raw prompt content only for model context", async () => {
    const diagnostics = [
      { file: "manager.ts", total: 1, errors: 1, warnings: 0, information: 0, hints: 0 },
    ];
    const manager = createManager(diagnostics);
    mockFns.LspManager.mockImplementation(function LspManagerMock() {
      return manager;
    });
    mockFns.formatDiagnosticsContext.mockReturnValue("<extension-context>raw</extension-context>");
    mockFns.diagnosticsContextFingerprint.mockReturnValue("diagnostics-fp");

    const { handlers, pi } = createPiWithRenderers();
    lspExtension(pi);
    const ctx = { cwd: "/project", ui: { notify: vi.fn() } };

    await handlers.get("session_start")?.({}, ctx);
    const emitted = (await handlers.get("before_agent_start")?.({}, ctx)) as
      | { message: Record<string, unknown> }
      | undefined;
    const message = emitted?.message;

    const result = handlers.get("context")?.({
      messages: [{ role: "custom", ...message }],
    });

    expect(result).toEqual({
      messages: [
        expect.objectContaining({
          content: "<extension-context>raw</extension-context>",
        }),
      ],
    });
    expect(message?.content).toBe("LSP diagnostics injected (1 error)");
  });
});
