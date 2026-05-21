import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileChangeType } from "../../src/config/types.ts";

const mockFns = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  loadLspSettings: vi.fn(() => ({ enabled: true, severity: 1, active: [] })),
  pruneAndReorderContextMessages: vi.fn((msgs: unknown) => msgs),
  restorePromptContent: vi.fn((msgs: unknown) => msgs),
  buildProjectGuidelines: vi.fn(() => []),
  buildLspToolPromptSurfaces: vi.fn(() => ({
    lsp_lookup: { description: "lookup", promptSnippet: "lookup", promptGuidelines: [] },
    lsp_document_symbols: {
      description: "document symbols",
      promptSnippet: "document symbols",
      promptGuidelines: [],
    },
    lsp_workspace_symbols: {
      description: "workspace symbols",
      promptSnippet: "workspace symbols",
      promptGuidelines: [],
    },
    lsp_diagnostics: {
      description: "diagnostics",
      promptSnippet: "diagnostics",
      promptGuidelines: [],
    },
    lsp_refactor: { description: "refactor", promptSnippet: "refactor", promptGuidelines: [] },
    lsp_recover: { description: "recover", promptSnippet: "recover", promptGuidelines: [] },
  })),
  diagnosticsContextFingerprint: vi.fn(() => null),
  formatDiagnosticsContext: vi.fn(() => null),
  promptGuidelines: [],
  promptSnippet: "",
  LspManager: vi.fn(),
  registerLspAwareToolOverrides: vi.fn(),
  registerLspSettings: vi.fn(),
  introspectCapabilities: vi.fn(() => []),
  scanProjectCapabilities: vi.fn(() => []),
  scanMissingServers: vi.fn(() => []),
  startDetectedServers: vi.fn(),
  toggleLspStatusOverlay: vi.fn(),
  updateLspUi: vi.fn(),
  scanWorkspaceSentinels: vi.fn(() => new Map<string, number>()),
  syncWorkspaceSentinelSnapshot: vi.fn(() => ({
    snapshot: new Map<string, number>([["/project/package.json", 100]]),
    changes: [{ uri: "file:///project/package.json", type: FileChangeType.Changed }],
  })),
  isWorkspaceRecoveryTrigger: vi.fn(),
  clearTsconfigCache: vi.fn(),
}));

vi.mock("../../src/config/config.ts", () => ({ loadConfig: mockFns.loadConfig }));
vi.mock("../../src/config/tsconfig-scope.ts", () => ({
  clearTsconfigCache: mockFns.clearTsconfigCache,
}));
vi.mock("../../src/tool/guidance.ts", () => ({
  buildProjectGuidelines: mockFns.buildProjectGuidelines,
  buildLspToolPromptSurfaces: mockFns.buildLspToolPromptSurfaces,
  defaultLspToolPromptSurfaces: mockFns.buildLspToolPromptSurfaces(),
  toolDescription: "test",
  promptGuidelines: mockFns.promptGuidelines,
  promptSnippet: mockFns.promptSnippet,
}));

vi.mock("../../src/diagnostics/diagnostic-context.ts", () => ({
  diagnosticsContextFingerprint: mockFns.diagnosticsContextFingerprint,
  formatDiagnosticsContext: mockFns.formatDiagnosticsContext,
  MAX_DETAILED_DIAGNOSTICS: 5,
}));
vi.mock("@mrclrchtr/supi-core/api", () => ({
  pruneAndReorderContextMessages: mockFns.pruneAndReorderContextMessages,
  restorePromptContent: mockFns.restorePromptContent,
  fileToUri: (filePath: string) => `file://${filePath}`,
  resolveToolPath: (cwd: string, target: string) =>
    `${cwd}/${target.startsWith("@") ? target.slice(1) : target}`.replace(/\/\/+/g, "/"),
  uriToFile: (uri: string) => uri.replace(/^file:\/\//, ""),
}));
vi.mock("../../src/session/settings-registration.ts", () => ({
  loadLspSettings: mockFns.loadLspSettings,
  getLspDisabledMessage: vi.fn(() => "LSP is disabled in settings"),
  registerLspSettings: mockFns.registerLspSettings,
}));
vi.mock("../../src/tool/overrides.ts", () => ({
  registerLspAwareToolOverrides: mockFns.registerLspAwareToolOverrides,
}));
vi.mock("../../src/manager/manager.ts", () => ({ LspManager: mockFns.LspManager }));
vi.mock("../../src/session/scanner.ts", () => ({
  introspectCapabilities: mockFns.introspectCapabilities,
  scanMissingServers: mockFns.scanMissingServers,
  scanProjectCapabilities: mockFns.scanProjectCapabilities,
  startDetectedServers: mockFns.startDetectedServers,
}));
vi.mock("../../src/ui/ui.ts", () => ({
  toggleLspStatusOverlay: mockFns.toggleLspStatusOverlay,
  updateLspUi: mockFns.updateLspUi,
}));
vi.mock("../../src/session/tree-persist.ts", () => ({
  persistLspActiveState: vi.fn(),
  persistLspInactiveState: vi.fn(),
  registerTreePersistHandlers: vi.fn(),
}));
vi.mock("../../src/ui/renderer.ts", () => ({ registerLspMessageRenderer: vi.fn() }));
vi.mock("../../src/diagnostics/diagnostic-display.ts", () => ({
  formatDiagnosticsDisplayContent: vi.fn(() => "display content"),
}));
vi.mock("../../src/diagnostics/workspace-sentinels.ts", () => ({
  scanWorkspaceSentinels: mockFns.scanWorkspaceSentinels,
  syncWorkspaceSentinelSnapshot: mockFns.syncWorkspaceSentinelSnapshot,
  isWorkspaceRecoveryTrigger: mockFns.isWorkspaceRecoveryTrigger,
}));

import lspExtension from "../../src/lsp.ts";
import { LSP_TOOL_NAMES } from "../../src/tool/names.ts";

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
  let activeTools: string[] = [...LSP_TOOL_NAMES];
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

  it("normalizes a leading @ when recovering after a write", async () => {
    const { handlers, ctx, manager } = await setupExtension();

    await handlers.get("tool_result")?.(
      {
        isError: false,
        toolName: "write",
        input: { path: "@src/generated/types.d.ts" },
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

  it("clears the tsconfig scope cache after editing a non-sentinel json file", async () => {
    const { handlers, ctx, manager } = await setupExtension();
    mockFns.clearTsconfigCache.mockClear();

    await handlers.get("tool_result")?.(
      {
        isError: false,
        toolName: "edit",
        input: { path: "config/base.json" },
        content: [],
      },
      ctx,
    );

    expect(mockFns.clearTsconfigCache).toHaveBeenCalledTimes(1);
    expect(manager.clearAllPullResultIds).not.toHaveBeenCalled();
    expect(manager.notifyWorkspaceFileChanges).not.toHaveBeenCalled();
  });
});
