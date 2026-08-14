// Unit tests for capability.transition debug telemetry.
// The event must fire only on semantic ready↔pending transitions and never on
// initialize, register, unregister, or shutdown clearing.

import { WorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectServerInfo } from "../../src/config/types.ts";
import type { ManagerLifecycleTransition } from "../../src/manager/manager.ts";

const mocks = vi.hoisted(() => ({
  managers: [] as Array<{ emit(transition: unknown): void }>,
  owners: [] as Array<{ shutdown: ReturnType<typeof vi.fn> }>,
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
  loadLspSettings: vi.fn().mockReturnValue({ enabled: true, active: [], exclude: [] }),
}));
vi.mock("../../src/config/tsconfig-scope.ts", () => ({ clearTsconfigCache: vi.fn() }));
vi.mock("../../src/diagnostics/workspace-sentinels.ts", () => ({
  scanWorkspaceSentinels: vi.fn(),
}));
vi.mock("../../src/manager/manager.ts", () => ({
  LspManager: class {
    getKnownProjectServers = vi.fn().mockReturnValue([]);
    registerDetectedServers = vi.fn();
    setExcludePatterns = vi.fn();
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
  clearWorkspaceLspRuntime: vi.fn(),
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
  scanProjectCapabilities: vi.fn().mockReturnValue([]),
  startDetectedServers: vi.fn().mockResolvedValue(undefined),
}));

import { LspRuntimeController } from "../../src/session/runtime-controller.ts";

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
): ManagerLifecycleTransition {
  return {
    kind,
    semanticReady,
    projectServers: semanticReady ? [readyServer] : [{ ...readyServer, ready: false }],
  };
}

function capabilityEvents() {
  return getDebugEvents({ source: "lsp", category: "capability.transition" }).events;
}

describe("LSP capability transition telemetry", () => {
  beforeEach(() => {
    configureDebugRegistry({ enabled: true, maxEvents: 100 });
  });

  afterEach(() => {
    mocks.managers.length = 0;
    mocks.owners.length = 0;
    vi.clearAllMocks();
    resetDebugRegistry();
  });

  it("emits one event per ready↔pending transition with workspace identity", async () => {
    const controller = new LspRuntimeController("/project", new WorkspaceRuntime());
    await controller.start();

    // Initial pending registration and startup publish no capability event.
    expect(capabilityEvents()).toHaveLength(0);

    mocks.managers[0]?.emit(managerTransition("readiness", true));
    mocks.managers[0]?.emit(managerTransition("crash", true));
    mocks.managers[0]?.emit(managerTransition("crash", false));
    mocks.managers[0]?.emit(managerTransition("tracked-files", false));

    const events = capabilityEvents();
    expect(events.map((event) => event.data)).toEqual([{ ready: false }, { ready: true }]);
    expect(events.every((event) => event.cwd === "/project")).toBe(true);
    expect(events[1]).toMatchObject({
      message: "LSP capability transition: ready",
      level: "debug",
    });
    await controller.shutdown();
  });

  it("publishes no capability event for shutdown clearing or late replay", async () => {
    const controller = new LspRuntimeController("/project", new WorkspaceRuntime());
    await controller.start();
    mocks.managers[0]?.emit(managerTransition("readiness", true));
    await controller.shutdown();

    // The ready transition fired once; shutdown unregistration does not.
    expect(capabilityEvents()).toHaveLength(1);
    expect(capabilityEvents()[0]?.data).toEqual({ ready: true });
  });
});
