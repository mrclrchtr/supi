import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFns = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  loadLspSettings: vi.fn(() => ({ enabled: true, severity: 1, active: [] })),
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
  scanMissingServers: vi.fn(() => []),
  startDetectedServers: vi.fn(),
  toggleLspStatusOverlay: vi.fn(),
  updateLspUi: vi.fn(),
  executeAction: vi.fn(),
}));

vi.mock("../src/config.ts", () => ({ loadConfig: mockFns.loadConfig }));

vi.mock("../src/guidance.ts", () => ({
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

vi.mock("../src/settings-registration.ts", () => ({
  loadLspSettings: mockFns.loadLspSettings,
  getLspDisabledMessage: vi.fn(() => "LSP is disabled in settings"),
  registerLspSettings: mockFns.registerLspSettings,
}));

vi.mock("../src/overrides.ts", () => ({
  registerLspAwareToolOverrides: mockFns.registerLspAwareToolOverrides,
}));

vi.mock("../src/manager.ts", () => ({ LspManager: mockFns.LspManager }));

vi.mock("../src/scanner.ts", () => ({
  introspectCapabilities: mockFns.introspectCapabilities,
  scanMissingServers: mockFns.scanMissingServers,
  scanProjectCapabilities: mockFns.scanProjectCapabilities,
  startDetectedServers: mockFns.startDetectedServers,
}));

vi.mock("../src/ui.ts", () => ({
  toggleLspStatusOverlay: mockFns.toggleLspStatusOverlay,
  updateLspUi: mockFns.updateLspUi,
}));

vi.mock("../src/tool-actions.ts", () => ({
  executeAction: mockFns.executeAction,
  lspToolDescription: "test",
}));

vi.mock("../src/renderer.ts", () => ({ registerLspMessageRenderer: vi.fn() }));
vi.mock("../src/diagnostic-display.ts", () => ({
  formatDiagnosticsDisplayContent: vi.fn(() => "display content"),
}));
vi.mock("../src/diagnostic-augmentation.ts", () => ({
  registerDiagnosticAugmentation: vi.fn(),
}));
vi.mock("../src/diagnostic-summary.ts", () => ({
  registerDiagnosticSummary: vi.fn(),
}));

import lspExtension from "../src/lsp.ts";
import { clearSessionLspService, getSessionLspService } from "../src/service-registry.ts";

function createManager(diagnostics: Array<{ file: string; total: number }>, cwd = "/project") {
  return {
    getCwd: vi.fn(() => cwd),
    shutdownAll: vi.fn(),
    pruneMissingFiles: vi.fn(),
    refreshOpenDiagnostics: vi.fn().mockResolvedValue(undefined),
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
  let activeTools = ["lsp"];
  const pi = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(event, handler);
    }),
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    getActiveTools: vi.fn(() => activeTools),
    setActiveTools: vi.fn((tools: string[]) => {
      activeTools = tools;
    }),
    appendEntry: vi.fn(),
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
  return { handlers, ctx, pi };
}

describe("system prompt stability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionLspService("/project");
    clearSessionLspService("/old-project");
    clearSessionLspService("/new-project");
    mockFns.loadConfig.mockReturnValue({ servers: {} });
    mockFns.loadLspSettings.mockReturnValue({ enabled: true, severity: 1, active: [] });
  });

  it("clears the previous cwd service when a new session starts before shutdown", async () => {
    const oldManager = createManager([], "/old-project");
    const newManager = createManager([], "/new-project");
    mockFns.LspManager.mockImplementationOnce(function LspManagerOldMock() {
      return oldManager;
    });
    mockFns.LspManager.mockImplementationOnce(function LspManagerNewMock() {
      return newManager;
    });
    const { handlers, pi } = createPiWithHandlers();
    lspExtension(pi);

    await handlers.get("session_start")?.({}, { cwd: "/old-project", ui: { notify: vi.fn() } });
    expect(getSessionLspService("/old-project").kind).toBe("ready");

    await handlers.get("session_start")?.({}, { cwd: "/new-project", ui: { notify: vi.fn() } });

    expect(oldManager.shutdownAll).toHaveBeenCalled();
    expect(getSessionLspService("/old-project").kind).toBe("unavailable");
    expect(getSessionLspService("/new-project").kind).toBe("ready");
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

  it("does not reactivate LSP after session tree restores inactive state", async () => {
    mockFns.formatDiagnosticsContext.mockReturnValue(
      '<extension-context source="supi-lsp">\nOutstanding diagnostics\n</extension-context>',
    );
    const { handlers, ctx, pi } = await setupExtension(createManager([{ file: "a.ts", total: 1 }]));

    await handlers.get("session_tree")?.(
      {},
      {
        sessionManager: {
          getBranch: () => [{ type: "custom", customType: "lsp-active", data: { active: false } }],
        },
      },
    );
    const result = await handlers.get("before_agent_start")?.(
      { systemPrompt: "Base system prompt." },
      ctx,
    );

    expect(result).toBeUndefined();
    expect(pi.getActiveTools()).not.toContain("lsp");
  });
});

describe("before_agent_start diagnostic refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFns.loadConfig.mockReturnValue({ servers: {} });
    mockFns.loadLspSettings.mockReturnValue({ enabled: true, severity: 1, active: [] });
  });

  it("calls refreshOpenDiagnostics before reading diagnostic summary", async () => {
    mockFns.formatDiagnosticsContext.mockReturnValue(null);
    mockFns.diagnosticsContextFingerprint.mockReturnValue(null);

    const manager = createManager([]);
    const callOrder: string[] = [];
    manager.pruneMissingFiles.mockImplementation(() => {
      callOrder.push("prune");
    });
    manager.refreshOpenDiagnostics.mockImplementation(async () => {
      callOrder.push("refresh");
    });
    manager.getOutstandingDiagnosticSummary.mockImplementation(() => {
      callOrder.push("summary");
      return [];
    });

    const { handlers, ctx } = await setupExtension(manager);
    await handlers.get("before_agent_start")?.({ systemPrompt: "test" }, ctx);

    expect(callOrder).toEqual(["prune", "refresh", "prune", "summary"]);
  });

  it("uses refreshed content for fingerprint deduplication", async () => {
    mockFns.formatDiagnosticsContext
      .mockReturnValueOnce('<extension-context source="supi-lsp">first</extension-context>')
      .mockReturnValueOnce('<extension-context source="supi-lsp">second</extension-context>');
    mockFns.diagnosticsContextFingerprint
      .mockReturnValueOnce("fp-first")
      .mockReturnValueOnce("fp-second");

    const manager = createManager([{ file: "a.ts", total: 1 }]);
    const { handlers, ctx } = await setupExtension(manager);

    // First call — should inject diagnostics
    const result1 = (await handlers.get("before_agent_start")?.(
      { systemPrompt: "test" },
      ctx,
    )) as Record<string, unknown>;
    expect(result1.message).toBeDefined();

    // Change the diagnostics after refresh
    manager.getOutstandingDiagnosticSummary.mockReturnValue([
      { file: "b.ts", total: 2, errors: 2, warnings: 0, information: 0, hints: 0 },
    ]);
    mockFns.formatDiagnosticsContext.mockReturnValue(
      '<extension-context source="supi-lsp">second</extension-context>',
    );
    mockFns.diagnosticsContextFingerprint.mockReturnValue("fp-second");

    // Second call — different fingerprint, should inject new diagnostics
    const result2 = (await handlers.get("before_agent_start")?.(
      { systemPrompt: "test" },
      ctx,
    )) as Record<string, unknown>;
    expect(result2.message).toBeDefined();
    expect(mockFns.diagnosticsContextFingerprint).toHaveBeenCalledTimes(2);
  });

  it("continues when refreshOpenDiagnostics throws", async () => {
    mockFns.formatDiagnosticsContext.mockReturnValue(
      '<extension-context source="supi-lsp">diags</extension-context>',
    );
    mockFns.diagnosticsContextFingerprint.mockReturnValue("fp-1");

    const manager = createManager([{ file: "a.ts", total: 1 }]);
    manager.refreshOpenDiagnostics.mockRejectedValue(new Error("LSP timeout"));

    const { handlers, ctx } = await setupExtension(manager);
    const result = (await handlers.get("before_agent_start")?.(
      { systemPrompt: "test" },
      ctx,
    )) as Record<string, unknown>;

    // Should still produce a result despite refresh failure
    expect(result.message).toBeDefined();
  });
});
