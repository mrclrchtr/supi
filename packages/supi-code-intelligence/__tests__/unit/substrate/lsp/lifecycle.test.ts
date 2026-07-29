import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    const controller = { kind: "ready" };
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

  it("releases its lease on session shutdown", async () => {
    const pi = createPiMock();
    const state = createLspAdapterState();
    registerLspSessionLifecycle(pi as never, state);
    await pi.emit("session_start", {}, makeCtx({ cwd: "/trusted" }));

    await pi.emit("session_shutdown", {}, makeCtx({ cwd: "/trusted" }));

    expect(mocks.release).toHaveBeenCalledOnce();
    expect(state.providerLease).toBeNull();
  });
});
