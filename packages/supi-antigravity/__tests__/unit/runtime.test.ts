import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSupiConfig } from "@mrclrchtr/supi-core/config";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getIsolatedAntigravityPaths } from "../../src/isolated-home.ts";
import { AntigravityRuntime } from "../../src/runtime.ts";

const roots: string[] = [];

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "supi-antigravity-runtime-test-"));
  roots.push(root);
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Antigravity runtime activation", () => {
  it("starts discovery without making the caller wait", async () => {
    const root = roots[0] as string;
    const cwd = join(root, "repo");
    await mkdir(cwd, { recursive: true });
    const discovery = deferred<{
      status: "available";
      cliVersion: string;
      catalogue: readonly ["gemini-3.8-flash-low"];
    }>();
    const discover = vi.fn(async () => discovery.promise);
    const pi = createPiMock();
    const runtime = new AntigravityRuntime({
      pi: pi as never,
      paths: getIsolatedAntigravityPaths(root),
      homeDir: root,
      discover: discover as never,
    });
    const context = makeCtx({ cwd });

    const refreshing = runtime.startRefresh(cwd, { ui: context.ui });
    let settled = false;
    void refreshing.then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(pi.tools).toHaveLength(0);
    expect(context.ui.setStatus).toHaveBeenCalledWith("supi-antigravity", undefined);

    discovery.resolve({
      status: "available",
      cliVersion: "1.1.25",
      catalogue: ["gemini-3.8-flash-low"],
    });
    await refreshing;
    expect(pi.tools).toHaveLength(1);
  });

  it("shows the ready status after activation and clears it on shutdown", async () => {
    const root = roots[0] as string;
    const cwd = join(root, "repo");
    await mkdir(cwd, { recursive: true });
    const pi = createPiMock();
    const runtime = new AntigravityRuntime({
      pi: pi as never,
      paths: getIsolatedAntigravityPaths(root),
      homeDir: root,
      discover: vi.fn(async () => ({
        status: "available" as const,
        cliVersion: "1.1.25",
        catalogue: ["gemini-3.8-flash-low"] as const,
      })) as never,
    });
    const context = makeCtx({ cwd });

    await runtime.startRefresh(cwd, { ui: context.ui });
    expect(context.ui.setStatus).toHaveBeenLastCalledWith(
      "supi-antigravity",
      "✓ antigravity ready",
    );

    await runtime.shutdown();
    expect(context.ui.setStatus).toHaveBeenLastCalledWith("supi-antigravity", undefined);
  });

  it("does not reject when an unavailable warning cannot be shown", async () => {
    const root = roots[0] as string;
    const cwd = join(root, "repo");
    await mkdir(cwd, { recursive: true });
    const pi = createPiMock();
    const runtime = new AntigravityRuntime({
      pi: pi as never,
      paths: getIsolatedAntigravityPaths(root),
      homeDir: root,
      discover: vi.fn(async () => ({
        status: "unavailable" as const,
        reason: "missing" as const,
        warning: "Antigravity CLI was not found.",
      })) as never,
    });
    const context = makeCtx({ cwd });
    const notify = vi.spyOn(context.ui, "notify").mockImplementation(() => {
      throw new Error("UI is closed");
    });

    await expect(runtime.startRefresh(cwd, { ui: context.ui })).resolves.toBeUndefined();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(context.ui.setStatus).toHaveBeenLastCalledWith("supi-antigravity", undefined);
  });

  it("reports an unexpected refresh failure", async () => {
    const root = roots[0] as string;
    const cwd = join(root, "repo");
    await mkdir(cwd, { recursive: true });
    const pi = createPiMock();
    vi.spyOn(pi, "registerTool").mockImplementation(() => {
      throw new Error("tool registration failed");
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const runtime = new AntigravityRuntime({
      pi: pi as never,
      paths: getIsolatedAntigravityPaths(root),
      homeDir: root,
      discover: vi.fn(async () => ({
        status: "available" as const,
        cliVersion: "1.1.25",
        catalogue: ["gemini-3.8-flash-low"] as const,
      })) as never,
    });
    const context = makeCtx({ cwd });

    try {
      await runtime.startRefresh(cwd, { ui: context.ui });

      expect(context.ui.notify).toHaveBeenCalledWith(
        "Antigravity availability check failed. Reload PI to retry.",
        "warning",
      );
      expect(warning).toHaveBeenCalledWith(
        "[supi-antigravity] Availability check failed: tool registration failed",
      );
    } finally {
      warning.mockRestore();
    }
  });

  it("keeps the diagnostic when its warning cannot be shown", async () => {
    const root = roots[0] as string;
    const cwd = join(root, "repo");
    await mkdir(cwd, { recursive: true });
    const pi = createPiMock();
    vi.spyOn(pi, "registerTool").mockImplementation(() => {
      throw new Error("tool registration failed");
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const runtime = new AntigravityRuntime({
      pi: pi as never,
      paths: getIsolatedAntigravityPaths(root),
      homeDir: root,
      discover: vi.fn(async () => ({
        status: "available" as const,
        cliVersion: "1.1.25",
        catalogue: ["gemini-3.8-flash-low"] as const,
      })) as never,
    });
    const context = makeCtx({ cwd });
    vi.spyOn(context.ui, "notify").mockImplementation(() => {
      throw new Error("UI is closed");
    });

    try {
      await expect(runtime.startRefresh(cwd, { ui: context.ui })).resolves.toBeUndefined();
      expect(warning).toHaveBeenCalledWith(
        "[supi-antigravity] Availability check failed: tool registration failed",
      );
    } finally {
      warning.mockRestore();
    }
  });

  it("does not let an older discovery activate after disable", async () => {
    const root = roots[0] as string;
    const cwd = join(root, "repo");
    await mkdir(cwd, { recursive: true });
    const first = deferred<{
      status: "available";
      cliVersion: string;
      catalogue: readonly ["gemini-3.8-flash-low"];
    }>();
    const discover = vi.fn(async () => first.promise);
    const pi = createPiMock();
    const runtime = new AntigravityRuntime({
      pi: pi as never,
      paths: getIsolatedAntigravityPaths(root),
      homeDir: root,
      discover: discover as never,
    });
    const context = makeCtx({ cwd });
    const refreshing = runtime.refresh(cwd, { ui: context.ui });
    writeSupiConfig(
      { section: "antigravity", scope: "project", cwd },
      { agentToolEnabled: false },
      { homeDir: root },
    );
    await runtime.refresh(cwd, { ui: context.ui });
    expect(context.ui.setStatus).toHaveBeenLastCalledWith("supi-antigravity", undefined);
    first.resolve({
      status: "available",
      cliVersion: "1.1.25",
      catalogue: ["gemini-3.8-flash-low"],
    });
    await refreshing;
    expect(pi.tools).toHaveLength(0);
    expect(pi.getActiveTools()).not.toContain("antigravity_run");
    expect(context.ui.setStatus).toHaveBeenLastCalledWith("supi-antigravity", undefined);
  });
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}
