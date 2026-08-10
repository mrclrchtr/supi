import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getWorkspaceLspRuntime } from "../../src/api.ts";
import type { LspManager } from "../../src/manager/manager.ts";
import {
  clearWorkspaceLspRuntime,
  createWorkspaceLspRuntimeOwner,
  setWorkspaceLspRuntimeState,
  waitForWorkspaceLspRuntime,
} from "../../src/session/runtime-registry.ts";

function createWorkspaceLspRuntime(manager: LspManager) {
  return createWorkspaceLspRuntimeOwner(manager).runtime;
}

describe("workspace LSP runtime registry", () => {
  beforeEach(() => {
    clearWorkspaceLspRuntime("/test");
    clearWorkspaceLspRuntime("/other");
    clearWorkspaceLspRuntime("/module-copy-test");
  });

  it("publishes an unavailable state when no session exists", () => {
    expect(getWorkspaceLspRuntime("/test")).toEqual({
      kind: "unavailable",
      reason: "No LSP session initialized for this workspace",
    });
  });

  it("publishes a ready runtime without exposing shutdown", () => {
    const manager = { getCwd: vi.fn().mockReturnValue("/test") } as unknown as LspManager;
    const runtime = createWorkspaceLspRuntime(manager);

    setWorkspaceLspRuntimeState("/test", { kind: "ready", runtime });

    expect(getWorkspaceLspRuntime("/test")).toEqual({ kind: "ready", runtime });
    expect(runtime).not.toHaveProperty("shutdown");
  });

  it.each([
    ["pending", { kind: "pending" }],
    ["disabled", { kind: "disabled" }],
  ] as const)("publishes %s state", (_label, state) => {
    setWorkspaceLspRuntimeState("/test", state);
    expect(getWorkspaceLspRuntime("/test")).toEqual(state);
  });

  it("publishes inactive state with its runtime", () => {
    const manager = { getCwd: vi.fn().mockReturnValue("/test") } as unknown as LspManager;
    const runtime = createWorkspaceLspRuntime(manager);

    setWorkspaceLspRuntimeState("/test", { kind: "inactive", runtime });

    expect(getWorkspaceLspRuntime("/test")).toEqual({ kind: "inactive", runtime });
  });

  it("isolates and normalizes workspace keys", () => {
    const root = path.join(process.cwd(), "tmp", "lsp-registry");
    setWorkspaceLspRuntimeState(path.join(root, "..", "lsp-registry"), { kind: "pending" });
    setWorkspaceLspRuntimeState("/other", { kind: "disabled" });

    expect(getWorkspaceLspRuntime(root)).toEqual({ kind: "pending" });
    expect(getWorkspaceLspRuntime("/other")).toEqual({ kind: "disabled" });
  });

  it("clears one workspace without affecting another", () => {
    setWorkspaceLspRuntimeState("/test", { kind: "pending" });
    setWorkspaceLspRuntimeState("/other", { kind: "disabled" });

    clearWorkspaceLspRuntime("/test");

    expect(getWorkspaceLspRuntime("/test").kind).toBe("unavailable");
    expect(getWorkspaceLspRuntime("/other")).toEqual({ kind: "disabled" });
  });

  it("shares state across module instances", async () => {
    vi.resetModules();
    const first = await import("../../src/session/runtime-registry.ts");
    first.setWorkspaceLspRuntimeState("/module-copy-test", { kind: "pending" });

    vi.resetModules();
    const second = await import("../../src/session/runtime-registry.ts");

    expect(second.getWorkspaceLspRuntime("/module-copy-test")).toEqual({ kind: "pending" });
    second.clearWorkspaceLspRuntime("/module-copy-test");
  });

  it("waits for a pending workspace to publish its runtime", async () => {
    setWorkspaceLspRuntimeState("/test", { kind: "pending" });
    const manager = { getCwd: vi.fn().mockReturnValue("/test") } as unknown as LspManager;
    const runtime = createWorkspaceLspRuntime(manager);

    setTimeout(() => {
      setWorkspaceLspRuntimeState("/test", { kind: "ready", runtime });
    }, 10);

    await expect(waitForWorkspaceLspRuntime("/test", 100)).resolves.toEqual({
      kind: "ready",
      runtime,
    });
  });

  it("returns an inactive runtime without polling", async () => {
    const manager = { getCwd: vi.fn().mockReturnValue("/test") } as unknown as LspManager;
    const runtime = createWorkspaceLspRuntime(manager);
    setWorkspaceLspRuntimeState("/test", { kind: "inactive", runtime });

    await expect(waitForWorkspaceLspRuntime("/test", 100)).resolves.toEqual({
      kind: "inactive",
      runtime,
    });
  });
});

describe("public LSP API", () => {
  it("exports the workspace registry", () => {
    expect(getWorkspaceLspRuntime).toBeInstanceOf(Function);
  });
});
