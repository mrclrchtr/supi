import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerLspSessionLifecycle } from "../../../../src/substrate/lsp/lifecycle.ts";
import { createLspAdapterState } from "../../../../src/substrate/lsp/state.ts";

const controllerMocks = vi.hoisted(() => {
  const instances: Array<{
    cwd: string;
    start: ReturnType<typeof vi.fn>;
    shutdown: ReturnType<typeof vi.fn>;
  }> = [];
  return { instances };
});

vi.mock("@mrclrchtr/supi-lsp/api", () => ({
  LspRuntimeController: class {
    cwd: string;
    start = vi.fn(async () => ({ kind: "ready" as const }));
    shutdown = vi.fn(async () => {});

    constructor(cwd: string) {
      this.cwd = cwd;
      controllerMocks.instances.push(this);
    }
  },
  scanWorkspaceSentinels: vi.fn(() => new Map([["package.json", 1]])),
}));

describe("LSP project trust lifecycle", () => {
  beforeEach(() => {
    controllerMocks.instances.length = 0;
  });

  it("does not create or start a workspace controller for an untrusted project", async () => {
    const pi = createPiMock();
    const state = createLspAdapterState();
    registerLspSessionLifecycle(pi as never, state);

    await pi.emit(
      "session_start",
      {},
      makeCtx({ cwd: "/untrusted", isProjectTrusted: () => false }),
    );

    expect(controllerMocks.instances).toHaveLength(0);
    expect(state.controller).toBeNull();
    expect(state.lspActive).toBe(false);
  });

  it("shuts down prior workspace state before entering an untrusted project", async () => {
    const pi = createPiMock();
    const state = createLspAdapterState();
    const shutdown = vi.fn(async () => {});
    state.controller = { shutdown } as never;
    state.lspActive = true;
    registerLspSessionLifecycle(pi as never, state);

    await pi.emit(
      "session_start",
      {},
      makeCtx({ cwd: "/untrusted", isProjectTrusted: () => false }),
    );

    expect(shutdown).toHaveBeenCalledOnce();
    expect(state.controller).toBeNull();
    expect(state.lspActive).toBe(false);
  });

  it("starts and publishes a controller after project trust is granted", async () => {
    const pi = createPiMock();
    const state = createLspAdapterState();
    registerLspSessionLifecycle(pi as never, state);

    await pi.emit("session_start", {}, makeCtx({ cwd: "/trusted" }));

    expect(controllerMocks.instances).toHaveLength(1);
    expect(controllerMocks.instances[0]?.start).toHaveBeenCalledOnce();
    expect(state.controller).toBe(controllerMocks.instances[0]);
    expect(state.lspActive).toBe(true);
    expect(state.sentinelSnapshot).toEqual(new Map([["package.json", 1]]));
  });
});
