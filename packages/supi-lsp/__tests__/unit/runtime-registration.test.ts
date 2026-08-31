import { type StructuralProvider, WorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { beforeEach, describe, expect, it } from "vitest";
import {
  markLspCapabilitiesReady,
  registerPendingLspCapabilities,
  unregisterLspCapabilities,
} from "../../src/session/runtime-registration.ts";
import type { WorkspaceLspRuntime } from "../../src/session/runtime-registry.ts";

describe("LSP runtime registration", () => {
  let runtime: WorkspaceRuntime;
  const service = {} as WorkspaceLspRuntime;

  beforeEach(() => {
    runtime = new WorkspaceRuntime();
  });

  it("publishes a pending semantic provider before readiness", () => {
    registerPendingLspCapabilities(runtime, "/project", service);

    const workspace = runtime.getWorkspace("/project");
    expect(workspace.semantic.state.kind).toBe("pending");
    expect(workspace.semantic.provider).not.toBeNull();
  });

  it("promotes the pending semantic provider to ready", () => {
    registerPendingLspCapabilities(runtime, "/project", service);

    markLspCapabilitiesReady(runtime, "/project");

    expect(runtime.getWorkspace("/project").semantic.state.kind).toBe("ready");
  });

  it("clears only the semantic capability on shutdown", () => {
    runtime.registerStructural("/project", {} as StructuralProvider);
    registerPendingLspCapabilities(runtime, "/project", service);

    unregisterLspCapabilities(runtime, "/project");

    const workspace = runtime.getWorkspace("/project");
    expect(workspace.semantic.state.kind).toBe("unavailable");
    expect(workspace.structural.state.kind).toBe("ready");
  });
});
