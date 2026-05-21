import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LspClient } from "../../src/client/client.ts";
import type { DocumentSymbol, Hover, Location, SymbolInformation } from "../../src/config/types.ts";
import type { LspManager } from "../../src/manager/manager.ts";
import {
  clearSessionLspService,
  getSessionLspService,
  SessionLspService,
  setSessionLspServiceState,
  waitForSessionLspService,
} from "../../src/session/service-registry.ts";

describe("session registry", () => {
  beforeEach(() => {
    clearSessionLspService("/test");
    clearSessionLspService("/other");
    clearSessionLspService("/module-copy-test");
  });

  it("returns unavailable when no state is set", () => {
    const state = getSessionLspService("/test");
    expect(state.kind).toBe("unavailable");
    if (state.kind === "unavailable") {
      expect(state.reason).toContain("No LSP session initialized");
    }
  });

  it("returns ready state with a service instance", () => {
    const manager = { getCwd: vi.fn().mockReturnValue("/test") } as unknown as LspManager;
    const service = new SessionLspService(manager);
    setSessionLspServiceState("/test", { kind: "ready", service });

    const state = getSessionLspService("/test");
    expect(state.kind).toBe("ready");
    if (state.kind === "ready") {
      expect(state.service).toBe(service);
    }
  });

  it("returns pending state", () => {
    setSessionLspServiceState("/test", { kind: "pending" });
    const state = getSessionLspService("/test");
    expect(state.kind).toBe("pending");
  });

  it("returns inactive state", () => {
    const manager = { getCwd: vi.fn().mockReturnValue("/test") } as unknown as LspManager;
    setSessionLspServiceState("/test", {
      kind: "inactive",
      service: new SessionLspService(manager),
    });
    const state = getSessionLspService("/test");
    expect(state.kind).toBe("inactive");
  });

  it("returns disabled state", () => {
    setSessionLspServiceState("/test", { kind: "disabled" });
    const state = getSessionLspService("/test");
    expect(state.kind).toBe("disabled");
  });

  it("clears state for a specific cwd", () => {
    setSessionLspServiceState("/test", { kind: "pending" });
    clearSessionLspService("/test");
    expect(getSessionLspService("/test").kind).toBe("unavailable");
  });

  it("isolates state by cwd", () => {
    const manager = { getCwd: vi.fn().mockReturnValue("/test") } as unknown as LspManager;
    setSessionLspServiceState("/test", { kind: "ready", service: new SessionLspService(manager) });
    setSessionLspServiceState("/other", { kind: "pending" });

    expect(getSessionLspService("/test").kind).toBe("ready");
    expect(getSessionLspService("/other").kind).toBe("pending");
  });

  it("normalizes cwd aliases", () => {
    const root = path.join(process.cwd(), "tmp", "lsp-registry");
    const alias = path.join(root, "..", "lsp-registry");
    setSessionLspServiceState(alias, { kind: "pending" });

    expect(getSessionLspService(root).kind).toBe("pending");
  });

  it("shares registry state across module instances", async () => {
    vi.resetModules();
    const first = await import("../../src/session/service-registry.ts");
    first.setSessionLspServiceState("/module-copy-test", { kind: "pending" });

    vi.resetModules();
    const second = await import("../../src/session/service-registry.ts");

    expect(second.getSessionLspService("/module-copy-test").kind).toBe("pending");
    second.clearSessionLspService("/module-copy-test");
  });
});

describe("SessionLspService semantic operations", () => {
  function makeManager(mockClient?: Partial<LspClient> | null): LspManager {
    return {
      getCwd: vi.fn().mockReturnValue("/project"),
      ensureFileOpen: vi.fn().mockResolvedValue(mockClient ?? null),
      workspaceSymbol: vi.fn().mockResolvedValue(null),
      canServeFile: vi.fn().mockReturnValue(true),
      isSupportedSourceFile: vi.fn().mockReturnValue(true),
      getOutstandingDiagnostics: vi.fn().mockReturnValue([]),
      getOutstandingDiagnosticSummary: vi.fn().mockReturnValue([]),
      getKnownProjectServers: vi.fn().mockReturnValue([]),
      getDiagnosticSummary: vi.fn().mockReturnValue([]),
      syncFileAndGetDiagnostics: vi.fn().mockResolvedValue([]),
      recoverWorkspaceDiagnostics: vi.fn().mockResolvedValue({
        refreshedClients: 0,
        restartedClients: 0,
        staleAssessment: { suspected: false, matchedFiles: [], warning: null },
      }),
    } as unknown as LspManager;
  }

  it("delegates hover to the client", async () => {
    const hover: Hover = { contents: "hover text" };
    const client = { hover: vi.fn().mockResolvedValue(hover) } as unknown as LspClient;
    const manager = makeManager(client);
    const service = new SessionLspService(manager);

    const result = await service.hover("src/index.ts", { line: 0, character: 0 });
    expect(result).toBe(hover);
    expect(manager.ensureFileOpen).toHaveBeenCalledWith("/project/src/index.ts");
    expect(client.hover).toHaveBeenCalledWith("/project/src/index.ts", { line: 0, character: 0 });
  });

  it("strips a leading @ from semantic file paths", async () => {
    const hover: Hover = { contents: "hover text" };
    const client = { hover: vi.fn().mockResolvedValue(hover) } as unknown as LspClient;
    const manager = makeManager(client);
    const service = new SessionLspService(manager);

    await service.hover("@src/index.ts", { line: 0, character: 0 });

    expect(manager.ensureFileOpen).toHaveBeenCalledWith("/project/src/index.ts");
    expect(client.hover).toHaveBeenCalledWith("/project/src/index.ts", { line: 0, character: 0 });
  });

  it("returns null hover when no client is available", async () => {
    const manager = makeManager(null);
    const service = new SessionLspService(manager);

    const result = await service.hover("src/index.ts", { line: 0, character: 0 });
    expect(result).toBeNull();
  });

  it("delegates definition to the client", async () => {
    const location: Location = {
      uri: "file:///project/src/other.ts",
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
    };
    const client = { definition: vi.fn().mockResolvedValue(location) } as unknown as LspClient;
    const manager = makeManager(client);
    const service = new SessionLspService(manager);

    const result = await service.definition("src/index.ts", { line: 5, character: 10 });
    expect(result).toBe(location);
    expect(manager.ensureFileOpen).toHaveBeenCalledWith("/project/src/index.ts");
    expect(client.definition).toHaveBeenCalledWith("/project/src/index.ts", {
      line: 5,
      character: 10,
    });
  });

  it("delegates references to the client", async () => {
    const locations: Location[] = [
      {
        uri: "file:///project/src/a.ts",
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      },
    ];
    const client = { references: vi.fn().mockResolvedValue(locations) } as unknown as LspClient;
    const manager = makeManager(client);
    const service = new SessionLspService(manager);

    const result = await service.references("src/index.ts", { line: 1, character: 2 });
    expect(result).toBe(locations);
    expect(manager.ensureFileOpen).toHaveBeenCalledWith("/project/src/index.ts");
    expect(client.references).toHaveBeenCalledWith("/project/src/index.ts", {
      line: 1,
      character: 2,
    });
  });

  it("delegates documentSymbols to the client", async () => {
    const symbols: DocumentSymbol[] = [
      {
        name: "foo",
        kind: 12,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
      },
    ];
    const client = { documentSymbols: vi.fn().mockResolvedValue(symbols) } as unknown as LspClient;
    const manager = makeManager(client);
    const service = new SessionLspService(manager);

    const result = await service.documentSymbols("src/index.ts");
    expect(result).toBe(symbols);
    expect(manager.ensureFileOpen).toHaveBeenCalledWith("/project/src/index.ts");
    expect(client.documentSymbols).toHaveBeenCalledWith("/project/src/index.ts");
  });

  it("delegates workspaceSymbol to the manager", async () => {
    const symbols: SymbolInformation[] = [
      {
        name: "foo",
        kind: 12,
        location: {
          uri: "file:///project/src/a.ts",
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        },
      },
    ];
    const manager = makeManager();
    manager.workspaceSymbol = vi.fn().mockResolvedValue(symbols);
    const service = new SessionLspService(manager);

    const result = await service.workspaceSymbol("foo");
    expect(result).toBe(symbols);
    expect(manager.workspaceSymbol).toHaveBeenCalledWith("foo");
  });

  it("delegates getProjectServers to the manager", () => {
    const manager = makeManager();
    const service = new SessionLspService(manager);

    service.getProjectServers();
    expect(manager.getKnownProjectServers).toHaveBeenCalledWith([]);
  });

  it("delegates explicit semantic support checks to the manager", () => {
    const manager = makeManager();
    const service = new SessionLspService(manager);

    service.isSupportedSourceFile("src/index.ts");
    expect(manager.canServeFile).toHaveBeenCalledWith("/project/src/index.ts");
  });

  it("delegates getOutstandingDiagnostics to the manager", () => {
    const manager = makeManager();
    const service = new SessionLspService(manager);

    service.getOutstandingDiagnostics(2);
    expect(manager.getOutstandingDiagnostics).toHaveBeenCalledWith(2);
  });

  it("delegates getOutstandingDiagnosticSummary to the manager", () => {
    const manager = makeManager();
    const service = new SessionLspService(manager);

    service.getOutstandingDiagnosticSummary(1);
    expect(manager.getOutstandingDiagnosticSummary).toHaveBeenCalledWith(1);
  });
});

describe("SessionLspService implementation support", () => {
  it("delegates implementation to the client when available", async () => {
    const locations: Location[] = [
      {
        uri: "file:///project/src/impl.ts",
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
      },
    ];
    const client = { implementation: vi.fn().mockResolvedValue(locations) } as unknown as LspClient;
    const manager = {
      getCwd: vi.fn().mockReturnValue("/project"),
      ensureFileOpen: vi.fn().mockResolvedValue(client),
    } as unknown as LspManager;

    const service = new SessionLspService(manager);
    const result = await service.implementation("src/index.ts", { line: 2, character: 3 });

    expect(result).toBe(locations);
    expect(manager.ensureFileOpen).toHaveBeenCalledWith("/project/src/index.ts");
    expect(client.implementation).toHaveBeenCalledWith("/project/src/index.ts", {
      line: 2,
      character: 3,
    });
  });

  it("returns null implementation when no client is available", async () => {
    const manager = {
      getCwd: vi.fn().mockReturnValue("/project"),
      ensureFileOpen: vi.fn().mockResolvedValue(null),
    } as unknown as LspManager;

    const service = new SessionLspService(manager);
    const result = await service.implementation("src/index.ts", { line: 0, character: 0 });
    expect(result).toBeNull();
  });
});

describe("waitForSessionLspService", () => {
  it("resolves a pending service once it becomes ready", async () => {
    setSessionLspServiceState("/test", { kind: "pending" });
    const manager = { getCwd: vi.fn().mockReturnValue("/test") } as unknown as LspManager;
    const service = new SessionLspService(manager);

    setTimeout(() => {
      setSessionLspServiceState("/test", { kind: "ready", service });
    }, 10);

    const state = await waitForSessionLspService("/test", 100);
    expect(state.kind).toBe("ready");
  });

  it("does not wait when the service is inactive", async () => {
    const manager = { getCwd: vi.fn().mockReturnValue("/test") } as unknown as LspManager;
    const service = new SessionLspService(manager);
    setSessionLspServiceState("/test", { kind: "inactive", service });

    const state = await waitForSessionLspService("/test", 100);
    expect(state.kind).toBe("inactive");
  });
});

describe("public API imports from package root", () => {
  it("can import getSessionLspService and SessionLspService from the package root", async () => {
    const mod = await import("../../src/index.ts");
    expect(mod.getSessionLspService).toBeInstanceOf(Function);
    expect(mod.SessionLspService).toBeInstanceOf(Function);
  });

  it("can import public types from the package root", async () => {
    const mod = await import("../../src/index.ts");
    // Type-only exports vanish at runtime; just verify the module loads
    expect(mod).toBeDefined();
  });
});
