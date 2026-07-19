import { WorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearRuntime: vi.fn(),
  createOwner: vi.fn(),
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
  loadLspSettings: vi.fn().mockReturnValue({ enabled: true, severity: 1, active: [], exclude: [] }),
}));
vi.mock("../../src/config/tsconfig-scope.ts", () => ({ clearTsconfigCache: vi.fn() }));
vi.mock("../../src/diagnostics/workspace-sentinels.ts", () => ({
  scanWorkspaceSentinels: vi.fn(),
}));
vi.mock("../../src/manager/manager.ts", () => ({
  LspManager: class {
    setExcludePatterns = vi.fn();
    registerDetectedServers = vi.fn();
    shutdownAll = mocks.shutdownAll;
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

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
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
    await flushAsyncWork();

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

  it("does not retract a newer runtime when an older warm-up fails", async () => {
    const firstWarmup = deferred<{ kind: "ready" }>();
    const secondWarmup = deferred<{ kind: "ready" }>();
    const firstOwner = {
      runtime: {
        getProjectServers: vi.fn().mockReturnValue([]),
        waitUntilReadyForWorkspace: vi.fn().mockReturnValue(firstWarmup.promise),
      },
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    const secondOwner = {
      runtime: {
        getProjectServers: vi.fn().mockReturnValue([]),
        waitUntilReadyForWorkspace: vi.fn().mockReturnValue(secondWarmup.promise),
      },
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    mocks.createOwner.mockReturnValueOnce(firstOwner).mockReturnValueOnce(secondOwner);

    const capabilityRuntime = new WorkspaceRuntime();
    const controller = new LspRuntimeController("/project", capabilityRuntime);
    await controller.start();
    await controller.start();

    expect(firstOwner.shutdown).toHaveBeenCalledOnce();
    expect(mocks.unregister).toHaveBeenCalledTimes(1);
    firstWarmup.reject(new Error("older runtime failed"));
    await flushAsyncWork();

    expect(mocks.unregister).toHaveBeenCalledTimes(1);
    const unavailableStates = mocks.setRuntimeState.mock.calls.filter(
      ([, state]) => (state as { kind?: string }).kind === "unavailable",
    );
    expect(unavailableStates).toEqual([]);

    expect(secondOwner.runtime.waitUntilReadyForWorkspace).toHaveBeenCalledOnce();
    secondWarmup.resolve({ kind: "ready" });
    await flushAsyncWork();
    expect(mocks.markReady).toHaveBeenCalledTimes(1);

    await controller.shutdown();
  });
});
