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

vi.mock("../config.ts", () => ({ loadConfig: mockFns.loadConfig }));

vi.mock("../guidance.ts", () => ({
  buildProjectGuidelines: mockFns.buildProjectGuidelines,
  diagnosticsContextFingerprint: mockFns.diagnosticsContextFingerprint,
  formatDiagnosticsContext: mockFns.formatDiagnosticsContext,
  lspPromptGuidelines: mockFns.lspPromptGuidelines,
  lspPromptSnippet: mockFns.lspPromptSnippet,
  MAX_DETAILED_DIAGNOSTICS: 5,
}));

vi.mock("@mrclrchtr/supi-core", () => ({
  pruneAndReorderContextMessages: mockFns.pruneAndReorderContextMessages,
  restorePromptContent: vi.fn((msgs: unknown[]) => msgs),
}));

vi.mock("../settings-registration.ts", () => ({
  loadLspSettings: mockFns.loadLspSettings,
  registerLspSettings: mockFns.registerLspSettings,
}));

vi.mock("../overrides.ts", () => ({
  registerLspAwareToolOverrides: mockFns.registerLspAwareToolOverrides,
}));

vi.mock("../manager.ts", () => ({ LspManager: mockFns.LspManager }));

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
  lspToolDescription: "test",
}));

vi.mock("../renderer.ts", () => ({ registerLspMessageRenderer: vi.fn() }));
vi.mock("../diagnostic-display.ts", () => ({
  formatDiagnosticsDisplayContent: vi.fn(() => "display content"),
}));
vi.mock("../diagnostic-augmentation.ts", () => ({
  registerDiagnosticAugmentation: vi.fn(),
}));
vi.mock("../diagnostic-summary.ts", () => ({
  registerDiagnosticSummary: vi.fn(),
}));

import lspExtension from "../lsp.ts";

function createManager(diagnostics: Array<{ file: string; total: number }>) {
  return {
    shutdownAll: vi.fn(),
    pruneMissingFiles: vi.fn(),
    getOutstandingDiagnosticSummary: vi.fn(() =>
      diagnostics.map((d) => ({
        file: d.file,
        total: d.total,
        errors: d.total,
        warnings: 0,
        information: 0,
        hints: 0,
      })),
    ),
    getOutstandingDiagnostics: vi.fn(() => []),
    registerDetectedServers: vi.fn(),
  };
}

function createPiWithHandlers() {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const pi = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(event, handler);
    }),
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    getActiveTools: vi.fn(() => ["lsp"]),
    setActiveTools: vi.fn(),
    onResource: vi.fn(),
  } as unknown as Parameters<typeof lspExtension>[0];
  return { handlers, pi };
}

async function setupExtension(manager: ReturnType<typeof createManager>) {
  mockFns.LspManager.mockImplementation(function LspManagerMock() {
    return manager;
  });
  const { handlers, pi } = createPiWithHandlers();
  lspExtension(pi);
  const ctx = { cwd: "/project", ui: { notify: vi.fn() } };
  await handlers.get("session_start")?.({}, ctx);
  return { handlers, ctx };
}

describe("system prompt stability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFns.loadConfig.mockReturnValue({ servers: {} });
    mockFns.loadLspSettings.mockReturnValue({ enabled: true, severity: 1, servers: [] });
  });

  it("does not modify the system prompt when no diagnostics are injected", async () => {
    mockFns.formatDiagnosticsContext.mockReturnValue(null);
    mockFns.diagnosticsContextFingerprint.mockReturnValue(null);

    const { handlers, ctx } = await setupExtension(createManager([]));
    const result = await handlers.get("before_agent_start")?.(
      { systemPrompt: "Base system prompt." },
      ctx,
    );

    expect(result).toBeUndefined();
  });

  it("injects diagnostics without modifying the system prompt", async () => {
    mockFns.formatDiagnosticsContext.mockReturnValue(
      '<extension-context source="supi-lsp">\nOutstanding diagnostics\n</extension-context>',
    );
    mockFns.diagnosticsContextFingerprint.mockReturnValue("fp-1");

    const { handlers, ctx } = await setupExtension(createManager([{ file: "a.ts", total: 1 }]));
    const result = (await handlers.get("before_agent_start")?.(
      { systemPrompt: "Base system prompt." },
      ctx,
    )) as Record<string, unknown>;

    expect(result.message).toBeDefined();
    expect(result.systemPrompt).toBeUndefined();
  });
});
