import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSupiConfig } from "@mrclrchtr/supi-core/config";
import { FOOTER_INVALIDATE_EVENT } from "@mrclrchtr/supi-core/footer-registry";
import { BRAILLE_SPINNER_FRAMES, SPINNER_INTERVAL_MS } from "@mrclrchtr/supi-core/spinner-frames";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsultingAgentAdapter } from "../../src/agents/types.ts";
import { CONSULTING_FOOTER_KEY } from "../../src/footer-constants.ts";
import { ConsultingRuntime } from "../../src/runtime.ts";

const roots: string[] = [];
const availability = {
  status: "available" as const,
  agent: "antigravity",
  agentVersion: "fake-agent-4",
  catalogue: Object.freeze(["native-model"]),
};

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "supi-consulting-runtime-test-"));
  roots.push(root);
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function makeAdapter(
  discover: ConsultingAgentAdapter["discover"] = async () => availability,
): ConsultingAgentAdapter {
  return {
    identity: "antigravity",
    consultationWorkspace: "/consultation-workspace",
    discover,
    execute: vi.fn(async () => {
      throw new Error("The runtime test does not execute Consultations.");
    }),
  };
}

describe("Consulting runtime activation", () => {
  it("starts discovery without making the caller wait", async () => {
    const root = roots[0] as string;
    const cwd = join(root, "repo");
    await mkdir(cwd, { recursive: true });
    const discovery = deferred<typeof availability>();
    const discover = vi.fn(async () => discovery.promise);
    const pi = createPiMock();
    const runtime = new ConsultingRuntime({
      pi: pi as never,
      adapter: makeAdapter(discover),
      homeDir: root,
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
    expect(runtime.isReady).toBe(false);
    expect(runtime.footerIcon).toBe(BRAILLE_SPINNER_FRAMES[0]);
    expect(context.ui.setStatus).toHaveBeenLastCalledWith(
      CONSULTING_FOOTER_KEY,
      BRAILLE_SPINNER_FRAMES[0],
    );

    discovery.resolve(availability);
    await refreshing;
    expect(pi.tools).toHaveLength(1);
    expect(pi.tools[0]).toMatchObject({
      name: "consulting_run",
      exposure: "model-only",
    });
    expect(runtime.isReady).toBe(true);
    expect(runtime.footerIcon).toBe("✦");
    expect(context.ui.setStatus).toHaveBeenLastCalledWith(CONSULTING_FOOTER_KEY, "✦");
  });

  it("advances the footer spinner until discovery is ready", async () => {
    vi.useFakeTimers();
    const root = roots[0] as string;
    const cwd = join(root, "repo");
    await mkdir(cwd, { recursive: true });
    const discovery = deferred<typeof availability>();
    const pi = createPiMock();
    const runtime = new ConsultingRuntime({
      pi: pi as never,
      adapter: makeAdapter(vi.fn(async () => discovery.promise)),
      homeDir: root,
    });
    const context = makeCtx({ cwd });

    const refreshing = runtime.startRefresh(cwd, { ui: context.ui });
    expect(runtime.footerIcon).toBe(BRAILLE_SPINNER_FRAMES[0]);
    vi.advanceTimersByTime(SPINNER_INTERVAL_MS);
    expect(runtime.footerIcon).toBe(BRAILLE_SPINNER_FRAMES[1]);

    discovery.resolve(availability);
    await refreshing;
    expect(runtime.footerIcon).toBe("✦");
    expect(context.ui.setStatus).toHaveBeenLastCalledWith(CONSULTING_FOOTER_KEY, "✦");
    await runtime.shutdown();
  });

  it("becomes ready after activation and resets on shutdown", async () => {
    const root = roots[0] as string;
    const cwd = join(root, "repo");
    await mkdir(cwd, { recursive: true });
    const pi = createPiMock();
    const runtime = new ConsultingRuntime({
      pi: pi as never,
      adapter: makeAdapter(),
      homeDir: root,
    });
    const context = makeCtx({ cwd });

    await runtime.startRefresh(cwd, { ui: context.ui });
    expect(runtime.isReady).toBe(true);
    expect(context.ui.setStatus).toHaveBeenCalledWith(CONSULTING_FOOTER_KEY, "✦");
    expect(pi.events.emit).toHaveBeenCalledWith(FOOTER_INVALIDATE_EVENT, {});

    await runtime.shutdown();
    expect(runtime.isReady).toBe(false);
    expect(context.ui.setStatus).toHaveBeenLastCalledWith(CONSULTING_FOOTER_KEY, undefined);
  });

  it("does not reject when an unavailable warning cannot be shown", async () => {
    const root = roots[0] as string;
    const cwd = join(root, "repo");
    await mkdir(cwd, { recursive: true });
    const pi = createPiMock();
    const runtime = new ConsultingRuntime({
      pi: pi as never,
      adapter: makeAdapter(async () => ({
        status: "unavailable",
        reason: "missing",
        warning: "Consulting Agent was not found.",
      })),
      homeDir: root,
    });
    const context = makeCtx({ cwd });
    const notify = vi.spyOn(context.ui, "notify").mockImplementation(() => {
      throw new Error("UI is closed");
    });

    await expect(runtime.startRefresh(cwd, { ui: context.ui })).resolves.toBeUndefined();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(runtime.isReady).toBe(false);
    expect(context.ui.setStatus).toHaveBeenLastCalledWith(CONSULTING_FOOTER_KEY, undefined);
  });

  it("clears the checking state when an agent returns an invalid snapshot", async () => {
    vi.useFakeTimers();
    const root = roots[0] as string;
    const pi = createPiMock();
    const runtime = new ConsultingRuntime({
      pi: pi as never,
      adapter: makeAdapter(async () => ({ ...availability, agent: "wrong-agent" })),
      homeDir: root,
    });
    const context = makeCtx({ cwd: root });
    try {
      await expect(runtime.refresh(root, context)).rejects.toThrow(/invalid availability snapshot/);
      expect(pi.tools).toHaveLength(0);
      expect(runtime.footerIcon).toBeUndefined();
      expect(context.ui.setStatus).toHaveBeenLastCalledWith(CONSULTING_FOOTER_KEY, undefined);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await runtime.shutdown();
    }
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
    const runtime = new ConsultingRuntime({
      pi: pi as never,
      adapter: makeAdapter(),
      homeDir: root,
    });
    const context = makeCtx({ cwd });

    try {
      await runtime.startRefresh(cwd, { ui: context.ui });
      expect(context.ui.notify).toHaveBeenCalledWith(
        "Consulting availability check failed. Reload PI to retry.",
        "warning",
      );
      expect(warning).toHaveBeenCalledWith(
        "[supi-consulting] Availability check failed: tool registration failed",
      );
    } finally {
      warning.mockRestore();
    }
  });

  it("keeps the discovery diagnostic when its warning cannot be shown", async () => {
    const root = roots[0] as string;
    const cwd = join(root, "repo");
    await mkdir(cwd, { recursive: true });
    const pi = createPiMock();
    vi.spyOn(pi, "registerTool").mockImplementation(() => {
      throw new Error("tool registration failed");
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const runtime = new ConsultingRuntime({
      pi: pi as never,
      adapter: makeAdapter(),
      homeDir: root,
    });
    const context = makeCtx({ cwd });
    vi.spyOn(context.ui, "notify").mockImplementation(() => {
      throw new Error("UI is closed");
    });

    try {
      await expect(runtime.startRefresh(cwd, { ui: context.ui })).resolves.toBeUndefined();
      expect(warning).toHaveBeenCalledWith(
        "[supi-consulting] Availability check failed: tool registration failed",
      );
    } finally {
      warning.mockRestore();
    }
  });

  it("does not let older discovery activate after disable", async () => {
    const root = roots[0] as string;
    const cwd = join(root, "repo");
    await mkdir(cwd, { recursive: true });
    const first = deferred<typeof availability>();
    const pi = createPiMock();
    const runtime = new ConsultingRuntime({
      pi: pi as never,
      adapter: makeAdapter(vi.fn(async () => first.promise)),
      homeDir: root,
    });
    const context = makeCtx({ cwd });
    const refreshing = runtime.refresh(cwd, { ui: context.ui });
    writeSupiConfig(
      { section: "consulting", scope: "project", cwd },
      { agentToolEnabled: false },
      { homeDir: root },
    );
    await runtime.refresh(cwd, { ui: context.ui });
    expect(runtime.isReady).toBe(false);
    expect(context.ui.setStatus).toHaveBeenLastCalledWith(CONSULTING_FOOTER_KEY, undefined);
    first.resolve(availability);
    await refreshing;
    expect(pi.tools).toHaveLength(0);
    expect(pi.getActiveTools()).not.toContain("consulting_run");
    expect(runtime.isReady).toBe(false);
    expect(context.ui.setStatus).toHaveBeenLastCalledWith(CONSULTING_FOOTER_KEY, undefined);
  });
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}
