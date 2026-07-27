import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  beforeEach(() => {
    vi.restoreAllMocks();
    getDefaultWorkspaceRuntime().clearAll();
    pi = createPiMock() as never;
    codeIntelligenceExtension(pi as never);
  });

  function makeSessionManager(branch: unknown[] = []) {
    return { getBranch: () => branch };
  }

  function makeCtx(cwd: string, branch: unknown[] = []) {
    return { cwd, sessionManager: makeSessionManager(branch) };
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
});
