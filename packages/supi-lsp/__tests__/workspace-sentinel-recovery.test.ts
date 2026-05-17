import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileChangeType } from "../src/types.ts";

const mockFns = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  loadLspSettings: vi.fn(() => ({ enabled: true, severity: 1, active: [] })),
  pruneAndReorderContextMessages: vi.fn((msgs: unknown) => msgs),
  restorePromptContent: vi.fn((msgs: unknown) => msgs),
  buildProjectGuidelines: vi.fn(() => []),
  diagnosticsContextFingerprint: vi.fn(() => null),
  formatDiagnosticsContext: vi.fn(() => null),
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
  scanWorkspaceSentinels: vi.fn(() => new Map<string, number>()),
  syncWorkspaceSentinelSnapshot: vi.fn(() => ({
    snapshot: new Map<string, number>([["/project/package.json", 100]]),
    changes: [{ uri: "file:///project/package.json", type: FileChangeType.Changed }],
  })),
  isWorkspaceRecoveryTrigger: vi.fn(),
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
vi.mock("@mrclrchtr/supi-core/api", () => ({
  pruneAndReorderContextMessages: mockFns.pruneAndReorderContextMessages,
  restorePromptContent: mockFns.restorePromptContent,
}));
vi.mock("../src/settings-registration.ts", () => ({
  loadLspSettings: mockFns.loadLspSettings,
  getLspDisabledMessage: vi.fn(() => "LSP is disabled in settings"),
  registerLspSettings: mockFns.registerLspSettings,
}));
vi.mock("../src/overrides.ts", () => ({
  registerLspAwareToolOverrides: mockFns.registerLspAwareToolOverrides,
}));
vi.mock("../src/manager/manager.ts", () => ({ LspManager: mockFns.LspManager }));
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
vi.mock("../src/tree-persist.ts", () => ({
  persistLspActiveState: vi.fn(),
  persistLspInactiveState: vi.fn(),
  registerTreePersistHandlers: vi.fn(),
}));
vi.mock("../src/renderer.ts", () => ({ registerLspMessageRenderer: vi.fn() }));
vi.mock("../src/diagnostics/diagnostic-display.ts", () => ({
  formatDiagnosticsDisplayContent: vi.fn(() => "display content"),
}));
vi.mock("../src/workspace-sentinels.ts", () => ({
  scanWorkspaceSentinels: mockFns.scanWorkspaceSentinels,
  syncWorkspaceSentinelSnapshot: mockFns.syncWorkspaceSentinelSnapshot,
  isWorkspaceRecoveryTrigger: mockFns.isWorkspaceRecoveryTrigger,
}));

import lspExtension from "../src/lsp.ts";

function createManager() {
  return {
    getCwd: vi.fn(() => "/project"),
    shutdownAll: vi.fn(),
    pruneMissingFiles: vi.fn(),
    refreshOpenDiagnostics: vi.fn().mockResolvedValue(undefined),
    getOutstandingDiagnosticSummary: vi.fn(() => []),
    getOutstandingDiagnostics: vi.fn(() => []),
    registerDetectedServers: vi.fn(),
    setExcludePatterns: vi.fn(),
    clearAllPullResultIds: vi.fn(),
    notifyWorkspaceFileChanges: vi.fn(),
    hasServerForExtension: vi.fn((filePath: string) => {
      return (
        filePath.endsWith(".ts") ||
        filePath.endsWith(".tsx") ||
        filePath.endsWith(".js") ||
        filePath.endsWith(".mjs") ||
        filePath.endsWith(".py")
      );
    }),
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

async function setupExtension() {
  const manager = createManager();
  mockFns.LspManager.mockImplementation(function LspManagerMock() {
    return manager;
  });
  const { handlers, pi } = createPiWithHandlers();
  lspExtension(pi);
  const ctx = { cwd: "/project", ui: { notify: vi.fn() } };
  await handlers.get("session_start")?.({}, ctx);
  return { handlers, ctx, manager };
}

describe("workspace sentinel recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFns.loadConfig.mockReturnValue({ servers: {} });
    mockFns.loadLspSettings.mockReturnValue({ enabled: true, severity: 1, active: [] });
    mockFns.diagnosticsContextFingerprint.mockReturnValue(null);
    mockFns.formatDiagnosticsContext.mockReturnValue(null);
    mockFns.isWorkspaceRecoveryTrigger.mockImplementation((pathValue: string) => {
      if (pathValue.endsWith(".d.ts")) return true;
      if (pathValue.endsWith("package.json")) return true;
      if (pathValue.endsWith("tsconfig.json")) return true;
      if (pathValue.includes("/tsconfig.") && pathValue.endsWith(".json")) return true;
      return false;
    });
  });

  it("soft-recovers when workspace sentinels change before an agent turn", async () => {
    const { handlers, ctx, manager } = await setupExtension();

    await handlers.get("before_agent_start")?.({ systemPrompt: "Base prompt" }, ctx);

    expect(manager.clearAllPullResultIds).toHaveBeenCalled();
    expect(manager.notifyWorkspaceFileChanges).toHaveBeenCalledWith([
      { uri: "file:///project/package.json", type: FileChangeType.Changed },
    ]);
    expect(manager.refreshOpenDiagnostics).toHaveBeenCalled();
  });

  it("soft-recovers immediately after writing a recovery-trigger file", async () => {
    const { handlers, ctx, manager } = await setupExtension();

    await handlers.get("tool_result")?.(
      {
        isError: false,
        toolName: "write",
        input: { path: "src/generated/types.d.ts" },
        content: [],
      },
      ctx,
    );

    expect(manager.clearAllPullResultIds).toHaveBeenCalled();
    expect(manager.notifyWorkspaceFileChanges).toHaveBeenCalledWith([
      { uri: "file:///project/src/generated/types.d.ts", type: FileChangeType.Changed },
    ]);
  });

  it("does not recover after reading a recovery-trigger file", async () => {
    const { handlers, ctx, manager } = await setupExtension();

    await handlers.get("tool_result")?.(
      {
        isError: false,
        toolName: "read",
        input: { path: "package.json" },
        content: [],
      },
      ctx,
    );

    expect(manager.clearAllPullResultIds).not.toHaveBeenCalled();
    expect(manager.notifyWorkspaceFileChanges).not.toHaveBeenCalled();
  });

  it("does not recover after a failed write", async () => {
    const { handlers, ctx, manager } = await setupExtension();

    await handlers.get("tool_result")?.(
      {
        isError: true,
        toolName: "write",
        input: { path: "package.json" },
        content: [],
      },
      ctx,
    );

    expect(manager.clearAllPullResultIds).not.toHaveBeenCalled();
    expect(manager.notifyWorkspaceFileChanges).not.toHaveBeenCalled();
  });

  it("soft-recovers after writing a source file matching a server extension", async () => {
    const { handlers, ctx, manager } = await setupExtension();

    await handlers.get("tool_result")?.(
      {
        isError: false,
        toolName: "write",
        input: { path: "src/new-module.ts" },
        content: [],
      },
      ctx,
    );

    expect(manager.clearAllPullResultIds).toHaveBeenCalled();
    expect(manager.notifyWorkspaceFileChanges).toHaveBeenCalledWith([
      { uri: "file:///project/src/new-module.ts", type: FileChangeType.Changed },
    ]);
  });

  it("does not recover after writing a file with an unrecognized extension", async () => {
    const { handlers, ctx, manager } = await setupExtension();

    await handlers.get("tool_result")?.(
      {
        isError: false,
        toolName: "write",
        input: { path: "data/data.xyz" },
        content: [],
      },
      ctx,
    );

    expect(manager.clearAllPullResultIds).not.toHaveBeenCalled();
    expect(manager.notifyWorkspaceFileChanges).not.toHaveBeenCalled();
  });
});
