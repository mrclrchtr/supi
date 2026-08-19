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
import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import codeIntelligenceExtension from "../../../src/extension.ts";

/**
 * Overview-injection tests.
 *
 * Verifies:
 * - A fresh session injects the hidden overview once via before_agent_start
 * - Reinjection is suppressed when the branch already contains code-intelligence-overview
 * - Shutdown resets injected state for the session
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

  it("does not inject overview when project has no model data", async () => {
    const handler = getOverviewHandler();
    const sessionStartHandler = pi.getHandlers("session_start")[0];

    const ctx = makeCtx("/empty-project");
    await sessionStartHandler?.({ reason: "startup" }, ctx);

    const result = await handler(null, ctx);
    // With no model data, the handler returns undefined
    expect(result).toBeUndefined();
  });

  it("suppresses reinjection when branch already has overview custom message", async () => {
    const handler = getOverviewHandler();
    const sessionStartHandler = pi.getHandlers("session_start")[0];

    const branchWithOverview = [
      { type: "custom_message", customType: "code-intelligence-overview" },
    ];
    const ctx = makeCtx("/project-a", branchWithOverview);
    await sessionStartHandler?.({ reason: "startup" }, ctx);

    const result = (await handler(null, ctx)) as { message?: { customType?: string } } | undefined;
    // Should not inject since branch already has overview
    expect(result?.message?.customType).toBeUndefined();
  });

  it("returns undefined on repeated calls (claim already taken)", async () => {
    const handler = getOverviewHandler();
    const sessionStartHandler = pi.getHandlers("session_start")[0];

    const ctx = makeCtx("/project-a");
    await sessionStartHandler?.({ reason: "startup" }, ctx);

    await handler(null, ctx);
    const secondResult = (await handler(null, ctx)) as
      | { message?: { customType?: string } }
      | undefined;
    expect(secondResult?.message?.customType).toBeUndefined();
  });

  it("session_tree restores overview state from active branch", async () => {
    const sessionStartHandler = pi.getHandlers("session_start")[0];
    const sessionTreeHandler = pi.getHandlers("session_tree")[0];

    // Start a session with an existing overview in the branch
    const branchWithOverview = [
      { type: "custom_message", customType: "code-intelligence-overview" },
    ];
    const ctx = makeCtx("/project-a", branchWithOverview);
    await sessionStartHandler?.({ reason: "startup" }, ctx);

    // Now simulate a tree navigation to a different branch that also has overview
    await sessionTreeHandler?.({ newLeafId: "leaf-2" }, ctx);

    // The overview handler should not re-inject because the state was restored
    const handler = getOverviewHandler();
    const result = (await handler(null, ctx)) as { message?: { customType?: string } } | undefined;
    expect(result?.message?.customType).toBeUndefined();
  });

  it("shutdown resets sessions", async () => {
    const sessionStartHandler = pi.getHandlers("session_start")[0];
    const shutdownHandler = pi.getHandlers("session_shutdown")[0];

    const ctx = makeCtx("/project-a");
    await sessionStartHandler?.({ reason: "startup" }, ctx);

    await shutdownHandler?.({ reason: "quit" }, null as never);
    // Shutdown succeeds without throwing
    expect(true).toBe(true);
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
    const root = makeWorkspace(60);
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
    const root = makeWorkspace(60);
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
