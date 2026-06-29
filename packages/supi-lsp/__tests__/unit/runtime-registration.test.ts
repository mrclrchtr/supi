import { type StructuralProvider, WorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  markLspCapabilitiesReady,
  registerLspCapabilities,
  registerPendingLspCapabilities,
  unregisterLspCapabilities,
} from "../../src/session/runtime-registration.ts";
import type { SessionLspService } from "../../src/session/service-registry.ts";

describe("LSP runtime registration", () => {
  let runtime: WorkspaceRuntime;

  beforeEach(() => {
    runtime = new WorkspaceRuntime();
  });

  it("publishes semantic capability when registered with a ready LSP service", () => {
    const service = createMockLspService();

    registerLspCapabilities(runtime, "/project", service);

    const ws = runtime.getWorkspace("/project");
    expect(ws.semantic.state.kind).toBe("ready");
    expect(ws.semantic.provider).not.toBeNull();
  });

  it("publishes semantic capability in pending state before promotion", () => {
    const service = createMockLspService();

    registerPendingLspCapabilities(runtime, "/project", service);

    const ws = runtime.getWorkspace("/project");
    expect(ws.semantic.state.kind).toBe("pending");
    expect(ws.semantic.provider).not.toBeNull();

    markLspCapabilitiesReady(runtime, "/project");
    expect(runtime.getWorkspace("/project").semantic.state.kind).toBe("ready");
  });

  it("does not publish structural capability", () => {
    const service = createMockLspService();

    registerLspCapabilities(runtime, "/project", service);

    const ws = runtime.getWorkspace("/project");
    expect(ws.semantic.state.kind).toBe("ready");
    expect(ws.structural.state.kind).toBe("unavailable");
  });

  it("unregisters capabilities on session shutdown", () => {
    const service = createMockLspService();

    registerLspCapabilities(runtime, "/project", service);
    unregisterLspCapabilities(runtime, "/project");

    const ws = runtime.getWorkspace("/project");
    expect(ws.semantic.state.kind).toBe("unavailable");
  });

  it("leaves structural capability intact when unregistering LSP alone", () => {
    const tsService = createMockTsService();
    runtime.registerStructural("/project", tsService);
    registerLspCapabilities(runtime, "/project", createMockLspService());

    unregisterLspCapabilities(runtime, "/project");

    const ws = runtime.getWorkspace("/project");
    expect(ws.semantic.state.kind).toBe("unavailable");
    expect(ws.structural.state.kind).toBe("ready");
  });

  it("supports multiple cwds independently", () => {
    const serviceA = createMockLspService();
    const serviceB = createMockLspService();

    registerLspCapabilities(runtime, "/project-a", serviceA);
    registerLspCapabilities(runtime, "/project-b", serviceB);

    expect(runtime.getWorkspace("/project-a").semantic.state.kind).toBe("ready");
    expect(runtime.getWorkspace("/project-b").semantic.state.kind).toBe("ready");

    unregisterLspCapabilities(runtime, "/project-a");
    expect(runtime.getWorkspace("/project-a").semantic.state.kind).toBe("unavailable");
    expect(runtime.getWorkspace("/project-b").semantic.state.kind).toBe("ready");
  });

  it("creates a SemanticProvider that delegates to the LSP service", async () => {
    const service = createMockLspService();
    const referencesSpy = vi.spyOn(service, "references");

    registerLspCapabilities(runtime, "/project", service);

    const ws = runtime.getWorkspace("/project");
    const provider = ws.semantic.provider;

    expect(provider).not.toBeNull();
    await provider?.references("test.ts", { line: 0, character: 0 });
    expect(referencesSpy).toHaveBeenCalledWith("test.ts", { line: 0, character: 0 });
  });

  it("propagates reference results from the LSP service through the provider", async () => {
    const mockLocations = [
      {
        uri: "file:///src/a.ts",
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      },
    ];
    const service = createMockLspService({ references: vi.fn().mockResolvedValue(mockLocations) });

    registerLspCapabilities(runtime, "/project", service);

    const ws = runtime.getWorkspace("/project");
    expect(ws.semantic.provider).not.toBeNull();
    const provider = ws.semantic.provider as NonNullable<typeof ws.semantic.provider>;
    const result = await provider.references("test.ts", { line: 0, character: 0 });
    expect(result).toEqual(mockLocations);
  });

  describe("refactor readiness", () => {
    it("reports refactorAvailable=true when LSP service supports rename", () => {
      const service = createMockLspService({
        rename: vi.fn().mockResolvedValue({
          changes: { "file:///src/index.ts": [] },
        }),
      });

      registerLspCapabilities(runtime, "/project", service);

      const ws = runtime.getWorkspace("/project");
      expect(ws.semantic.refactorAvailable).toBe(true);
    });

    it("reports refactorAvailable=true when LSP service supports code actions", () => {
      const service = createMockLspService({
        codeActions: vi.fn().mockResolvedValue([]),
      });

      registerLspCapabilities(runtime, "/project", service);

      const ws = runtime.getWorkspace("/project");
      expect(ws.semantic.refactorAvailable).toBe(true);
    });

    it("reports refactorAvailable=true even when LSP rename returns null (capability is method-presence-based)", () => {
      const service = createMockLspService({
        rename: vi.fn().mockResolvedValue(null),
      });

      registerLspCapabilities(runtime, "/project", service);

      const ws = runtime.getWorkspace("/project");
      // SessionLspService always has rename and codeActions → adapter always exposes them → refactorAvailable is true
      expect(ws.semantic.refactorAvailable).toBe(true);
    });
  });
});

function createMockLspService(overrides?: Partial<SessionLspService>): SessionLspService {
  const defaults: Record<string, unknown> = {
    references: vi.fn().mockResolvedValue(null),
    implementation: vi.fn().mockResolvedValue(null),
    documentSymbols: vi.fn().mockResolvedValue(null),
    workspaceSymbol: vi.fn().mockResolvedValue(null),
    hover: vi.fn().mockResolvedValue(null),
    definition: vi.fn().mockResolvedValue(null),
    rename: vi.fn().mockResolvedValue(null),
    codeActions: vi.fn().mockResolvedValue(null),
    fileDiagnostics: vi.fn().mockResolvedValue(null),
    getProjectServers: vi.fn().mockReturnValue([]),
    isSupportedSourceFile: vi.fn().mockReturnValue(true),
    getWorkspaceDiagnosticSummary: vi.fn().mockReturnValue([]),
    getOutstandingDiagnostics: vi.fn().mockReturnValue([]),
    getOutstandingDiagnosticSummary: vi.fn().mockReturnValue([]),
    recoverDiagnostics: vi.fn().mockResolvedValue({
      refreshedClients: 0,
      restartedClients: 0,
      staleAssessment: { suspected: false, matchedFiles: [], warning: null },
    }),
    resolveFilePath: vi.fn().mockImplementation((f: string) => f),
  };
  return { ...defaults, ...overrides } as unknown as SessionLspService;
}

function createMockTsService(): StructuralProvider {
  return {
    calleesAt: vi.fn().mockResolvedValue({
      kind: "unsupported-language" as const,
      file: "x",
      message: "mock",
    }),
    exports: vi.fn().mockResolvedValue({
      kind: "unsupported-language" as const,
      file: "x",
      message: "mock",
    }),
    outline: vi.fn().mockResolvedValue({
      kind: "unsupported-language" as const,
      file: "x",
      message: "mock",
    }),
    imports: vi.fn().mockResolvedValue({
      kind: "unsupported-language" as const,
      file: "x",
      message: "mock",
    }),
    nodeAt: vi.fn().mockResolvedValue({
      kind: "unsupported-language" as const,
      file: "x",
      message: "mock",
    }),
    callSites: vi.fn().mockResolvedValue({
      kind: "unsupported-language" as const,
      file: "x",
      message: "mock",
    }),
  };
}
