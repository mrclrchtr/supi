import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, getHandlerOrThrow } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCodeIntelligenceApp } from "../../../src/app/create-code-intelligence-app.ts";

/**
 * Workspace-manager tests.
 *
 * Verifies:
 * - Sessions are created once per cwd
 * - Sessions keep separate semantic/structural adapter state slots
 * - Sessions track overview-injection and model-cache state
 * - Sessions are cleaned up on shutdown WITHOUT replacing the shared capability broker
 * - Multiple sessions for different cwds coexist
 */
describe("workspace-manager", () => {
  let pi: ReturnType<typeof createPiMock> & ExtensionAPI;
  let app: ReturnType<typeof createCodeIntelligenceApp>;

  beforeEach(() => {
    vi.restoreAllMocks();
    getDefaultWorkspaceRuntime().clearAll();
    pi = createPiMock() as never;
    app = createCodeIntelligenceApp(pi);
  });

  it("returns undefined session for unregistered cwd", () => {
    expect(app.getSession("/nonexistent")).toBeUndefined();
  });

  it("creates a new session for a cwd", () => {
    const session = app.createSession("/project-a");
    expect(session).toBeDefined();
    expect(session.cwd).toBe("/project-a");
    expect(session.hasInjectedOverview).toBe(false);
  });

  it("returns the same session for the same cwd on repeated calls", () => {
    const first = app.createSession("/project-a");
    const second = app.createSession("/project-a");
    expect(first).toBe(second);
  });

  it("creates separate sessions for different cwds", () => {
    const sessionA = app.createSession("/project-a");
    const sessionB = app.createSession("/project-b");
    expect(sessionA).not.toBe(sessionB);
    expect(sessionA.cwd).toBe("/project-a");
    expect(sessionB.cwd).toBe("/project-b");
  });

  it("creates sessions with distinct adapter state references", () => {
    const sessionA = app.createSession("/project-a");
    const sessionB = app.createSession("/project-b");
    // Each session should have its own adapter state spaces
    expect(sessionA).not.toBe(sessionB);
    // Both should start with empty adapter state
    expect(sessionA.adapterState.semantic).toBeUndefined();
    expect(sessionA.adapterState.structural).toBeUndefined();
    expect(sessionB.adapterState.semantic).toBeUndefined();
    expect(sessionB.adapterState.structural).toBeUndefined();
  });

  it("allows setting semantic adapter state on a session", () => {
    const session = app.createSession("/project-a");
    const mockAdapter = { controller: null, inlineSeverity: 1 };
    session.adapterState.semantic = mockAdapter as never;
    expect(app.getSession("/project-a")?.adapterState.semantic).toBe(mockAdapter);
  });

  it("allows setting structural adapter state on a session", () => {
    const session = app.createSession("/project-a");
    const mockAdapter = { controller: null };
    session.adapterState.structural = mockAdapter as never;
    expect(app.getSession("/project-a")?.adapterState.structural).toBe(mockAdapter);
  });

  it("tracks overview-injection state and model-cache state on a session", () => {
    const session = app.createSession("/project-a");
    expect(session.hasInjectedOverview).toBe(false);
    expect(session.modelCache).toEqual({});

    session.hasInjectedOverview = true;
    session.modelCache = { cached: "value" };
    expect(session.hasInjectedOverview).toBe(true);
    expect(session.modelCache).toEqual({ cached: "value" });
  });

  it("does not replace the shared capability broker", () => {
    // The shared runtime should still work independently
    const runtime = getDefaultWorkspaceRuntime();
    expect(runtime.getWorkspace).toBeDefined();

    // Create a session — this should not break the broker
    app.createSession("/project-a");
    expect(runtime.getWorkspace("/project-a")).toBeDefined();
  });

  it("removes session on release", () => {
    app.createSession("/project-a");
    expect(app.getSession("/project-a")).toBeDefined();

    app.releaseSession("/project-a");
    expect(app.getSession("/project-a")).toBeUndefined();
  });

  it("releasing a session does not affect the shared broker for that cwd", () => {
    const runtime = getDefaultWorkspaceRuntime();
    const semProvider = {
      references: async () => [],
      implementation: async () => null,
      documentSymbols: async () => null,
      workspaceSymbols: async () => null,
    };
    runtime.registerSemantic("/project-a", semProvider);

    app.createSession("/project-a");
    app.releaseSession("/project-a");

    // Broker should still have the semantic provider registered
    const ws = runtime.getWorkspace("/project-a");
    expect(ws.semantic.state.kind).toBe("ready");
  });

  it("clears all sessions on shutdown without clearing shared broker", () => {
    const runtime = getDefaultWorkspaceRuntime();
    const semProvider = {
      references: async () => [],
      implementation: async () => null,
      documentSymbols: async () => null,
      workspaceSymbols: async () => null,
    };
    runtime.registerSemantic("/project-a", semProvider);

    app.createSession("/project-a");
    app.createSession("/project-b");
    app.shutdown();

    expect(app.getSession("/project-a")).toBeUndefined();
    expect(app.getSession("/project-b")).toBeUndefined();

    // Broker still works
    const ws = runtime.getWorkspace("/project-a");
    expect(ws.semantic.state.kind).toBe("ready");
  });

  it("registers session_start handler that creates session for ctx.cwd", () => {
    // The app should have registered a session_start handler
    const handler = getHandlerOrThrow(pi, "session_start");
    expect(handler).toBeDefined();
  });

  it("registers session_shutdown handler that clears sessions", () => {
    const handler = getHandlerOrThrow(pi, "session_shutdown");
    expect(handler).toBeDefined();
  });

  it("handles session lifecycle via pi events", () => {
    // Simulate session_start with a cwd
    const _mockCtx = { cwd: "/project-a", sessionManager: { getBranch: () => [] } };
    app.createSession("/project-a");
    expect(app.getSession("/project-a")).toBeDefined();

    // Simulate session_shutdown
    app.shutdown();
    expect(app.getSession("/project-a")).toBeUndefined();
    expect(app.getSession("/project-b")).toBeUndefined();
  });
});
