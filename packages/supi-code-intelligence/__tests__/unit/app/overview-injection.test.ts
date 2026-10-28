import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { createPiMock, getHandlerOrThrow } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import codeIntelligenceExtension from "../../../src/extension.ts";

/**
 * Overview-injection tests.
 *
 * Verifies:
 * - A fresh session injects the hidden overview once via before_agent_start
 * - Reinjection is suppressed when the branch already contains code-intelligence-overview
 * - session_tree restores overview state from the active branch
 *
 * Uses the full extension factory (codeIntelligenceExtension) because the
 * before_agent_start handler is registered there, not in createCodeIntelligenceApp.
 *
 * The extension registers two before_agent_start handlers:
 *   0: native instruction path capture (sync, no return)
 *   1: overview injection (async, returns BeforeAgentStartEventResult)
 */
describe("overview injection", () => {
  let pi: ReturnType<typeof createPiMock> & ExtensionAPI;
  let homeDir: string;
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    resetDebugRegistry();
    getDefaultWorkspaceRuntime().clearAll();
    pi = createPiMock() as never;
    // An isolated empty global config keeps every injection decision hermetic.
    homeDir = mkdtempSync(path.join(os.tmpdir(), "ci-overview-home-"));
    tempDirs.push(homeDir);
    codeIntelligenceExtension(pi as never, undefined, homeDir);
  });

  afterEach(() => {
    resetDebugRegistry();
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
    tempDirs.length = 0;
  });

  /** Create a single-package workspace fixture and return its root. */
  function makeWorkspace(packageCount: number): string {
    const root = mkdtempSync(path.join(os.tmpdir(), "ci-overview-inject-"));
    tempDirs.push(root);
    mkdirSync(path.join(root, "packages"), { recursive: true });
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "fixture-workspace",
        description: "Free-text workspace description",
        private: true,
      }),
    );
    writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
    for (let index = 0; index < packageCount; index++) {
      const dir = path.join(root, "packages", `pkg-${String(index).padStart(3, "0")}`);
      mkdirSync(path.join(dir, "src"), { recursive: true });
      writeFileSync(path.join(dir, "src/index.ts"), "export const value = 1;\n");
      writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({
          name: `fixture-pkg-${String(index).padStart(3, "0")}`,
          description: `Free-text package description ${index}`,
          main: "src/index.ts",
          dependencies: {
            [`fixture-pkg-${String((index + 1) % packageCount).padStart(3, "0")}`]: "workspace:*",
            [`fixture-pkg-${String((index + 2) % packageCount).padStart(3, "0")}`]: "workspace:*",
          },
        }),
      );
    }
    return root;
  }

  /** Write an explicit code-intelligence project config into a workspace root. */
  function writeProjectConfig(root: string, config: Record<string, unknown>): void {
    mkdirSync(path.join(root, ".pi/supi"), { recursive: true });
    writeFileSync(
      path.join(root, ".pi/supi/config.json"),
      JSON.stringify({ "code-intelligence": config }),
    );
  }

  function makeSessionManager(branch: unknown[] = []) {
    return { getBranch: () => branch };
  }

  function makeCtx(cwd: string, branch: unknown[] = [], trusted = true) {
    return { cwd, sessionManager: makeSessionManager(branch), isProjectTrusted: () => trusted };
  }

  /** The overview handler is the second before_agent_start handler (index 1). */
  function getOverviewHandler() {
    const handlers = pi.getHandlers("before_agent_start");
    expect(handlers.length).toBeGreaterThanOrEqual(2);
    return handlers[1];
  }

  it("injects a bounded overview without a package manifest", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ci-source-only-"));
    tempDirs.push(root);
    writeFileSync(path.join(root, "main.py"), "pass\n");
    const ctx = makeCtx(root);
    await pi.getHandlers("session_start")[0]?.({ reason: "startup" }, ctx);
    const result = (await getOverviewHandler()(null, ctx)) as { message?: { content: string } };
    expect(result?.message?.content).toContain("1 regular file");
    expect(result?.message?.content).toContain(".py");
    expect(result?.message?.content).not.toContain("No package.json");
    expect(result?.message?.content.length).toBeLessThanOrEqual(8000);
  });

  it("does not inject an overview for an inaccessible working directory", async () => {
    const handler = getOverviewHandler();
    const sessionStartHandler = pi.getHandlers("session_start")[0];

    const ctx = makeCtx("/empty-project");
    await sessionStartHandler?.({ reason: "startup" }, ctx);

    const result = await handler(null, ctx);
    // With no model data, the handler returns undefined
    expect(result).toBeUndefined();
  });

  it("suppresses reinjection when branch already has overview custom message", async () => {
    const root = makeWorkspace(1);
    writeProjectConfig(root, { overviewEnabled: true });
    const branchWithOverview = [
      { type: "custom_message", customType: "code-intelligence-overview" },
    ];
    const ctx = makeCtx(root, branchWithOverview);
    await getHandlerOrThrow(pi, "session_start")({ reason: "startup" }, ctx);

    expect(await getOverviewHandler()(null, ctx)).toBeUndefined();
  });

  it("injects only once across repeated calls", async () => {
    const root = makeWorkspace(1);
    writeProjectConfig(root, { overviewEnabled: true });
    const ctx = makeCtx(root);
    await getHandlerOrThrow(pi, "session_start")({ reason: "startup" }, ctx);
    const handler = getOverviewHandler();

    expect(await handler(null, ctx)).toMatchObject({
      message: { customType: "code-intelligence-overview" },
    });
    expect(await handler(null, ctx)).toBeUndefined();
  });

  it("suppresses injection after switching to a branch with an overview", async () => {
    const root = makeWorkspace(1);
    writeProjectConfig(root, { overviewEnabled: true });
    await getHandlerOrThrow(pi, "session_start")({ reason: "startup" }, makeCtx(root));

    const ctx = makeCtx(root, [
      { type: "custom_message", customType: "code-intelligence-overview" },
    ]);
    await getHandlerOrThrow(pi, "session_tree")({ newLeafId: "leaf-2" }, ctx);

    expect(await getOverviewHandler()(null, ctx)).toBeUndefined();
  });

  it("injects after switching from a branch with an overview to one without it", async () => {
    const root = makeWorkspace(2);
    writeProjectConfig(root, { overviewEnabled: true });
    const current = makeCtx(root, [
      { type: "custom_message", customType: "code-intelligence-overview" },
    ]);
    await pi.getHandlers("session_start")[0]?.({ reason: "startup" }, current);
    expect(await getOverviewHandler()(null, current)).toBeUndefined();
    const next = makeCtx(root, []);
    await pi.getHandlers("session_tree")[0]?.({ newLeafId: "empty-branch" }, next);
    const result = await getOverviewHandler()(null, next);
    expect(result).toMatchObject({ message: { customType: "code-intelligence-overview" } });
  });

  it("injects the hidden overview on the first turn when enabled", async () => {
    const handler = getOverviewHandler();
    const sessionStartHandler = pi.getHandlers("session_start")[0];
    const root = makeWorkspace(4);
    // An explicit project value keeps the test independent of any global config.
    writeProjectConfig(root, { overviewEnabled: true });
    const ctx = makeCtx(root);
    await sessionStartHandler?.({ reason: "startup" }, ctx);

    const result = (await handler(null, ctx)) as
      | { message?: { customType?: string; display?: boolean; content?: string } }
      | undefined;

    expect(result?.message?.customType).toBe("code-intelligence-overview");
    expect(result?.message?.display).toBe(false);
    expect(result?.message?.content).toContain("fixture-workspace");
    expect(result?.message?.content).toContain("fixture-pkg-000");
    expect(result?.message?.content).toContain("fixture-pkg-003");
    // One-line manifest descriptions are included as untrusted evidence.
    expect(result?.message?.content).toContain("Free-text workspace description");
    expect(result?.message?.content).toContain("Free-text package description");
    expect(result?.message?.content).toContain("untrusted evidence");
  });

  it("emits no overview when overviewEnabled is false", async () => {
    const handler = getOverviewHandler();
    const sessionStartHandler = pi.getHandlers("session_start")[0];
    const root = makeWorkspace(2);
    writeProjectConfig(root, { overviewEnabled: false });
    const ctx = makeCtx(root);
    await sessionStartHandler?.({ reason: "startup" }, ctx);

    const result = await handler(null, ctx);

    expect(result).toBeUndefined();
  });

  it("ignores an untrusted project's overview setting and keeps the default", async () => {
    const handler = getOverviewHandler();
    const sessionStartHandler = pi.getHandlers("session_start")[0];
    const root = makeWorkspace(2);
    writeProjectConfig(root, { overviewEnabled: false });
    const ctx = makeCtx(root, [], false);
    await sessionStartHandler?.({ reason: "startup" }, ctx);

    const result = (await handler(null, ctx)) as { message?: { customType?: string } } | undefined;

    // The untrusted project override is ignored, so the default true applies.
    expect(result?.message?.customType).toBe("code-intelligence-overview");
  });

  it("pins the overview setting once per session without a mid-session toggle", async () => {
    const handler = getOverviewHandler();
    const sessionStartHandler = pi.getHandlers("session_start")[0];
    const root = makeWorkspace(2);
    writeProjectConfig(root, { overviewEnabled: false });
    const ctx = makeCtx(root);
    await sessionStartHandler?.({ reason: "startup" }, ctx);

    // First turn: disabled, no injection.
    expect(await handler(null, ctx)).toBeUndefined();

    // The config changes before the next turn; the pinned value still applies.
    writeProjectConfig(root, { overviewEnabled: true });
    const second = await handler(null, ctx);
    expect(second).toBeUndefined();
  });

  it("notifies the user and records a debug event when the overview exceeds the soft token budget", async () => {
    configureDebugRegistry({ enabled: true, maxEvents: 100 });
    const notify = vi.fn();
    const handler = getOverviewHandler();
    const sessionStartHandler = pi.getHandlers("session_start")[0];
    const root = makeWorkspace(100);
    writeProjectConfig(root, { overviewEnabled: true });
    const ctx = { ...makeCtx(root), hasUI: true, ui: { notify } };
    await sessionStartHandler?.({ reason: "startup" }, ctx);

    const result = (await handler(null, ctx)) as
      | { message?: { customType?: string; content?: string } }
      | undefined;

    expect(result?.message?.customType).toBe("code-intelligence-overview");
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("token budget"), "warning");
    const events = getDebugEvents({ source: "code-intelligence", category: "overview" }).events;
    expect(events.some((event) => event.level === "warning")).toBe(true);
    // The warning is never part of the model-facing overview content.
    expect(result?.message?.content).not.toContain("budget");
    expect(result?.message?.content).not.toContain("token");
    expect(result?.message?.content).not.toContain("warning");
  });

  it("records the budget warning without a UI notification in headless sessions", async () => {
    configureDebugRegistry({ enabled: true, maxEvents: 100 });
    const handler = getOverviewHandler();
    const sessionStartHandler = pi.getHandlers("session_start")[0];
    const root = makeWorkspace(100);
    writeProjectConfig(root, { overviewEnabled: true });
    // makeCtx carries no hasUI/ui, matching headless child sessions.
    const ctx = makeCtx(root);
    await sessionStartHandler?.({ reason: "startup" }, ctx);

    const result = (await handler(null, ctx)) as { message?: { customType?: string } } | undefined;

    expect(result?.message?.customType).toBe("code-intelligence-overview");
    const events = getDebugEvents({ source: "code-intelligence", category: "overview" }).events;
    expect(events.some((event) => event.level === "warning")).toBe(true);
  });
});
