import { WorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearRuntime: vi.fn(),
  createOwner: vi.fn(),
  managerListeners: [] as Array<(transition: unknown) => void>,
  markReady: vi.fn(),
  registerPending: vi.fn(),
  setRuntimeState: vi.fn(),
  shutdownAll: vi.fn().mockResolvedValue(undefined),
  startDetectedServers: vi.fn().mockResolvedValue(undefined),
  unregister: vi.fn(),
}));

vi.mock("../../src/config/config.ts", () => ({
  loadConfig: vi.fn().mockReturnValue({
    servers: {
      typescript: {
        command: "typescript-language-server",
        fileTypes: ["ts"],
        rootMarkers: ["package.json"],
      },
    },
  }),
}));
vi.mock("../../src/config/lsp-settings.ts", () => ({
  loadLspSettings: vi.fn().mockReturnValue({ exclude: [] }),
}));
vi.mock("../../src/config/tsconfig-scope.ts", () => ({ clearTsconfigCache: vi.fn() }));
vi.mock("../../src/diagnostics/workspace-sentinels.ts", () => ({
  scanWorkspaceSentinels: vi.fn(),
}));
vi.mock("../../src/manager/manager.ts", () => ({
  LspManager: class {
    registerDetectedServers = vi.fn();
    shutdownAll = mocks.shutdownAll;

    constructor(_config: unknown, _cwd: string, listener?: (transition: unknown) => void) {
      if (listener) mocks.managerListeners.push(listener);
    }
  },
}));
vi.mock("../../src/session/runtime-registration.ts", () => ({
  markLspCapabilitiesReady: mocks.markReady,
  registerPendingLspCapabilities: mocks.registerPending,
  unregisterLspCapabilities: mocks.unregister,
}));
vi.mock("../../src/session/runtime-registry.ts", () => ({
  clearWorkspaceLspRuntime: mocks.clearRuntime,
  createWorkspaceLspRuntimeOwner: mocks.createOwner,
  setWorkspaceLspRuntimeState: mocks.setRuntimeState,
}));
vi.mock("../../src/session/scanner.ts", () => ({
  scanMissingServers: vi.fn().mockReturnValue([]),
  scanProjectCapabilities: vi.fn().mockReturnValue([]),
  startDetectedServers: mocks.startDetectedServers,
}));

import { LspRuntimeController } from "../../src/session/runtime-controller.ts";

afterEach(() => {
  mocks.managerListeners.length = 0;
  vi.clearAllMocks();
});

describe("LspRuntimeController warm-up ownership", () => {
  it("keeps a lazy runtime owner pending when no workspace client is ready", async () => {
    const owner = {
      runtime: {
        getProjectServers: vi.fn().mockReturnValue([]),
        waitUntilReadyForWorkspace: vi
          .fn()
          .mockResolvedValue({ kind: "unavailable", reason: "No active LSP clients" }),
      },
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    mocks.createOwner.mockReturnValueOnce(owner);

    const controller = new LspRuntimeController("/project", new WorkspaceRuntime());
    const result = await controller.start();

    expect(result.kind).toBe("ready");
    expect(mocks.registerPending).toHaveBeenCalledOnce();
    expect(mocks.markReady).not.toHaveBeenCalled();
    expect(mocks.unregister).not.toHaveBeenCalled();
    expect(mocks.setRuntimeState).not.toHaveBeenCalledWith(
      "/project",
      expect.objectContaining({ kind: "unavailable" }),
    );

    await controller.shutdown();
  });

  it("ignores a transition from a superseded runtime generation", async () => {
    const firstOwner = {
      runtime: { getProjectServers: vi.fn().mockReturnValue([]) },
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    const secondOwner = {
      runtime: { getProjectServers: vi.fn().mockReturnValue([]) },
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    mocks.createOwner.mockReturnValueOnce(firstOwner).mockReturnValueOnce(secondOwner);

    const controller = new LspRuntimeController("/project", new WorkspaceRuntime());
    await controller.start();
    await controller.start();

    expect(firstOwner.shutdown).toHaveBeenCalledOnce();
    expect(mocks.unregister).toHaveBeenCalledTimes(1);
    mocks.managerListeners[0]?.({
      kind: "readiness",
      semanticReady: true,
      projectServers: [],
    });
    expect(mocks.markReady).not.toHaveBeenCalled();

    mocks.managerListeners[1]?.({
      kind: "readiness",
      semanticReady: true,
      projectServers: [],
    });
    expect(mocks.markReady).toHaveBeenCalledOnce();

    await controller.shutdown();
  });
});
