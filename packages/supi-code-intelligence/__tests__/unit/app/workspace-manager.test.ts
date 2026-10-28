import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  completedCodeQuery,
  getDefaultWorkspaceRuntime,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, getHandlerOrThrow, makeCtx } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCodeIntelligenceApp } from "../../../src/app/app.ts";

/**
 * Workspace-manager tests.
 *
 * Verifies:
 * - Sessions are created once per cwd
 * - Sessions keep separate refactor plan and workflow target stores
 * - Sessions track overview-injection state
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
    expect(session.claimOverviewInjection()).toBe(true);
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

  it("claims overview injection once per session", () => {
    const session = app.createSession("/project-a");
    expect(session.claimOverviewInjection()).toBe(true);
    expect(session.claimOverviewInjection()).toBe(false);
  });

  it("restores overview state from branch history", () => {
    const session = app.createSession("/project-a");
    session.restoreOverviewInjection();
    expect(session.claimOverviewInjection()).toBe(false);
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
      references: async () => completedCodeQuery([]),
      implementation: async () => unavailableCodeQuery("not configured"),
      documentSymbols: async () => unavailableCodeQuery("not configured"),
      workspaceSymbols: async () => unavailableCodeQuery("not configured"),
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
      references: async () => completedCodeQuery([]),
      implementation: async () => unavailableCodeQuery("not configured"),
      documentSymbols: async () => unavailableCodeQuery("not configured"),
      workspaceSymbols: async () => unavailableCodeQuery("not configured"),
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

  it("creates and clears workspace sessions through lifecycle events", async () => {
    const start = getHandlerOrThrow(pi, "session_start");
    const shutdown = getHandlerOrThrow(pi, "session_shutdown");
    const first = makeCtx({ cwd: "/project-a" });
    const second = makeCtx({ cwd: "/project-b" });

    await start({ type: "session_start", reason: "startup" }, first);
    await start({ type: "session_start", reason: "startup" }, second);
    expect(app.getSession("/project-a")).toMatchObject({ cwd: "/project-a" });
    expect(app.getSession("/project-b")).toMatchObject({ cwd: "/project-b" });

    await shutdown({ type: "session_shutdown" }, first);
    expect(app.getSession("/project-a")).toBeUndefined();
    expect(app.getSession("/project-b")).toBeUndefined();
  });
});
