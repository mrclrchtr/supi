import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerLspSessionLifecycle } from "../../../../src/substrate/lsp/lifecycle.ts";
import { createLspAdapterState } from "../../../../src/substrate/lsp/state.ts";

const mocks = vi.hoisted(() => ({ acquire: vi.fn(), release: vi.fn() }));
vi.mock("../../../../src/substrate/workspace-provider-host.ts", () => ({
  acquireWorkspaceProviderHost: mocks.acquire,
}));

describe("LSP shared-host lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.acquire.mockResolvedValue({
      lspController: null,
      sentinelSnapshot: new Map(),
      release: mocks.release,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mirrors an untrusted project's decision to the provider host", async () => {
    const pi = createPiMock();
    const state = createLspAdapterState();
    registerLspSessionLifecycle(pi as never, state);

    await pi.emit(
      "session_start",
      {},
      makeCtx({ cwd: "/untrusted", isProjectTrusted: () => false }),
    );

    expect(mocks.acquire).toHaveBeenCalledWith("/untrusted", { projectTrusted: false });
    expect(state.controller).toBeNull();
    expect(state.lspActive).toBe(false);
  });

  it("retains the shared controller and sentinel snapshot for a trusted project", async () => {
    const pi = createPiMock();
    const state = createLspAdapterState();
    const controller = { kind: "ready", subscribeLifecycle: vi.fn(() => vi.fn()) };
    const snapshot = new Map([["package.json", 1]]);
    mocks.acquire.mockResolvedValue({
      lspController: controller,
      sentinelSnapshot: snapshot,
      release: mocks.release,
    });
    registerLspSessionLifecycle(pi as never, state);

    await pi.emit("session_start", {}, makeCtx({ cwd: "/trusted" }));

    expect(mocks.acquire).toHaveBeenCalledWith("/trusted", { projectTrusted: true });
    expect(state.controller).toBe(controller);
    expect(state.lspActive).toBe(true);
    expect(state.sentinelSnapshot).toBe(snapshot);
  });

  it("subscribes to transitions without a periodic readiness timer", async () => {
    const pi = createPiMock();
    const state = createLspAdapterState();
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    let publishTransition: (() => void) | undefined;
    const controller = {
      kind: "ready",
      subscribeLifecycle: vi.fn((listener: () => void) => {
        publishTransition = listener;
        return vi.fn();
      }),
    };
    mocks.acquire.mockResolvedValue({
      lspController: controller,
      sentinelSnapshot: new Map(),
      release: mocks.release,
    });
    let stateChangeCount = 0;
    state.stateChanges.addEventListener("server-status-changed", () => stateChangeCount++);
    registerLspSessionLifecycle(pi as never, state);

    await pi.emit("session_start", {}, makeCtx({ cwd: "/trusted" }));
    const countAfterStart = stateChangeCount;
    publishTransition?.();

    expect(controller.subscribeLifecycle).toHaveBeenCalledOnce();
    expect(stateChangeCount).toBe(countAfterStart + 1);
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("releases its lease and lifecycle listener on session shutdown", async () => {
    const pi = createPiMock();
    const state = createLspAdapterState();
    const disposeLifecycle = vi.fn();
    mocks.acquire.mockResolvedValue({
      lspController: {
        kind: "ready",
        subscribeLifecycle: vi.fn(() => disposeLifecycle),
      },
      sentinelSnapshot: new Map(),
      release: mocks.release,
    });
    registerLspSessionLifecycle(pi as never, state);
    await pi.emit("session_start", {}, makeCtx({ cwd: "/trusted" }));

    await pi.emit("session_shutdown", {}, makeCtx({ cwd: "/trusted" }));

    expect(disposeLifecycle).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(state.providerLease).toBeNull();
  });
});
