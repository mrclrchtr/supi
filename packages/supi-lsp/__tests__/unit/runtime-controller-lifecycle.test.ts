import { WorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectServerInfo } from "../../src/config/types.ts";
import type { ManagerLifecycleTransition } from "../../src/manager/manager.ts";

const mocks = vi.hoisted(() => ({
  clearRuntime: vi.fn(),
  loadLspSettings: vi.fn().mockReturnValue({ enabled: true, active: [], exclude: [] }),
  scanProjectCapabilities: vi.fn().mockReturnValue([]),
  managers: [] as Array<{
    emit(transition: unknown): void;
    getKnownProjectServers: ReturnType<typeof vi.fn>;
    registerDetectedServers: ReturnType<typeof vi.fn>;
    shutdownAll: ReturnType<typeof vi.fn>;
  }>,
  owners: [] as Array<{
    runtime: {
      getProjectServers: ReturnType<typeof vi.fn>;
      waitUntilReadyForWorkspace: ReturnType<typeof vi.fn>;
    };
    shutdown: ReturnType<typeof vi.fn>;
  }>,
  setRuntimeState: vi.fn(),
}));

vi.mock("../../src/config/config.ts", () => ({
  loadConfig: vi.fn().mockReturnValue({
    servers: {
      typescript: {
        command: "node",
        fileTypes: ["ts"],
        rootMarkers: ["package.json"],
      },
    },
  }),
}));
vi.mock("../../src/config/lsp-settings.ts", () => ({
  loadLspSettings: mocks.loadLspSettings,
}));
vi.mock("../../src/config/tsconfig-scope.ts", () => ({ clearTsconfigCache: vi.fn() }));
vi.mock("../../src/diagnostics/workspace-sentinels.ts", () => ({}));
vi.mock("../../src/manager/manager.ts", () => ({
  LspManager: class {
    getKnownProjectServers = vi.fn().mockReturnValue([]);
    registerDetectedServers = vi.fn();
    shutdownAll = vi.fn().mockResolvedValue(undefined);

    constructor(
      _config: unknown,
      _cwd: string,
      private readonly listener?: (transition: unknown) => void,
    ) {
      mocks.managers.push(this);
    }

    emit(transition: unknown): void {
      this.listener?.(transition);
    }
  },
}));
vi.mock("../../src/session/runtime-registry.ts", () => ({
  clearWorkspaceLspRuntime: mocks.clearRuntime,
  createWorkspaceLspRuntimeOwner: vi.fn(() => {
    const owner = {
      runtime: {
        getProjectServers: vi.fn().mockReturnValue([]),
        waitUntilReadyForWorkspace: vi.fn().mockResolvedValue({ kind: "unavailable" }),
      },
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    mocks.owners.push(owner);
    return owner;
  }),
  setWorkspaceLspRuntimeState: mocks.setRuntimeState,
}));
vi.mock("../../src/session/scanner.ts", () => ({
  scanMissingServers: vi.fn().mockReturnValue([]),
  scanProjectCapabilities: mocks.scanProjectCapabilities,
  startDetectedServers: vi.fn().mockResolvedValue(undefined),
}));

import {
  LspRuntimeController,
  type LspRuntimeTransition,
} from "../../src/session/runtime-controller.ts";

const readyServer: ProjectServerInfo = {
  name: "typescript",
  root: "/project",
  fileTypes: ["ts"],
  status: "running",
  supportedActions: [],
  openFiles: [],
  ready: true,
};

function managerTransition(
  kind: ManagerLifecycleTransition["kind"],
  semanticReady: boolean,
  projectServers: readonly ProjectServerInfo[] = semanticReady
    ? [readyServer]
    : [{ ...readyServer, ready: false }],
): ManagerLifecycleTransition {
  return { kind, semanticReady, projectServers };
}

afterEach(() => {
  mocks.managers.length = 0;
  mocks.owners.length = 0;
  mocks.loadLspSettings.mockReset().mockReturnValue({ enabled: true, active: [], exclude: [] });
  mocks.scanProjectCapabilities.mockReset().mockReturnValue([]);
  vi.clearAllMocks();
});

describe("LspRuntimeController lifecycle projection", () => {
  it("projects aggregate readiness while it retains the runtime owner", async () => {
    const capabilities = new WorkspaceRuntime();
    const controller = new LspRuntimeController("/project", capabilities);
    const transitions: LspRuntimeTransition[] = [];
    controller.subscribeLifecycle((transition) => transitions.push(transition));

    const result = await controller.start();
    const runtime = result.kind === "ready" ? result.runtime : null;
    expect(runtime).not.toBeNull();
    expect(capabilities.getWorkspace("/project").semantic.state.kind).toBe("pending");

    mocks.managers[0]?.emit(managerTransition("readiness", true));

    expect(capabilities.getWorkspace("/project").semantic.state.kind).toBe("ready");

    mocks.managers[0]?.emit(managerTransition("crash", true));
    expect(capabilities.getWorkspace("/project").semantic.state.kind).toBe("ready");

    mocks.managers[0]?.emit(managerTransition("crash", false));

    expect(capabilities.getWorkspace("/project").semantic.state.kind).toBe("pending");
    expect(controller.kind).toBe("ready");
    expect(controller.workspaceRuntime).toBe(runtime);
    expect(transitions.map((transition) => transition.semanticReady)).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(transitions.map((transition) => transition.generation)).toEqual([1, 2, 3, 4]);
  });

  it("rebuilds the automatic path policy on runtime restart", async () => {
    const controller = new LspRuntimeController("/project", new WorkspaceRuntime());

    await controller.start();
    const firstPolicy = mocks.scanProjectCapabilities.mock.calls[0]?.[3] as {
      isEligible(candidate: string, kind?: "file" | "directory"): boolean;
    };
    expect(firstPolicy.isEligible("/project/generated/file.ts")).toBe(true);
    expect(firstPolicy.isEligible("/project/.pi/private.ts")).toBe(false);

    mocks.loadLspSettings.mockReturnValue({
      enabled: true,
      active: [],
      exclude: ["generated/"],
    });
    await controller.start();

    const secondPolicy = mocks.scanProjectCapabilities.mock.calls[1]?.[3] as {
      isEligible(candidate: string, kind?: "file" | "directory"): boolean;
    };
    expect(secondPolicy.isEligible("/project/generated/file.ts")).toBe(false);
    expect(secondPolicy.isEligible("/project/src/file.ts")).toBe(true);

    await controller.shutdown();
  });

  it("replays the latest transition to a late subscriber", async () => {
    const controller = new LspRuntimeController("/project", new WorkspaceRuntime());
    await controller.start();
    mocks.managers[0]?.emit(managerTransition("readiness", true));
    const transitions: LspRuntimeTransition[] = [];

    controller.subscribeLifecycle((transition) => transitions.push(transition));

    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      generation: 2,
      kind: "readiness",
      semanticReady: true,
    });
  });

  it("publishes shutdown with the next monotonic generation", async () => {
    const controller = new LspRuntimeController("/project", new WorkspaceRuntime());
    const transitions: LspRuntimeTransition[] = [];
    controller.subscribeLifecycle((transition) => transitions.push(transition));
    await controller.start();

    await controller.shutdown();

    expect(transitions.map(({ generation, kind }) => ({ generation, kind }))).toEqual([
      { generation: 1, kind: "startup" },
      { generation: 2, kind: "shutdown" },
    ]);
  });

  it("stops notifications after listener disposal", async () => {
    const controller = new LspRuntimeController("/project", new WorkspaceRuntime());
    const transitions: LspRuntimeTransition[] = [];
    const dispose = controller.subscribeLifecycle((transition) => transitions.push(transition));
    await controller.start();

    dispose();
    dispose();
    mocks.managers[0]?.emit(managerTransition("tracked-files", false));
    await controller.shutdown();

    expect(transitions.map((transition) => transition.kind)).toEqual(["startup"]);
  });
});
