import {
  getDefaultWorkspaceRuntime,
  type SemanticProvider,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import {
  clearWorkspaceLspRuntime,
  setWorkspaceLspRuntimeState,
  type WorkspaceLspRuntimeState,
} from "@mrclrchtr/supi-lsp/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureSemanticReadiness } from "../../../../src/analysis/readiness.ts";

describe("ensureSemanticReadiness", () => {
  afterEach(() => {
    getDefaultWorkspaceRuntime().clearAll();
    clearWorkspaceLspRuntime("/test");
  });

  function registerReadySemantic(cwd: string) {
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(cwd, createMockSemanticProvider());
  }

  function registerPendingSemantic(cwd: string) {
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemanticPending(cwd, createMockSemanticProvider());
  }

  it("returns unavailable when no semantic provider is registered", async () => {
    const result = await ensureSemanticReadiness("/test", { kind: "workspace" }, 100);
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toContain("No semantic/LSP provider");
    }
  });

  it("returns ready when both semantic capability and the LSP runtime are ready", async () => {
    registerReadySemantic("/test");
    const waitUntilReadyForWorkspace = vi.fn().mockResolvedValue({ kind: "ready" });
    setWorkspaceLspRuntimeState("/test", {
      kind: "ready",
      runtime: { waitUntilReadyForWorkspace },
    } as unknown as WorkspaceLspRuntimeState);

    const result = await ensureSemanticReadiness("/test", { kind: "workspace" }, 100);

    expect(result.kind).toBe("ready");
    expect(waitUntilReadyForWorkspace).toHaveBeenCalledWith({ timeoutMs: 100 });
  });

  it("forwards request control into the runtime readiness wait", async () => {
    registerReadySemantic("/test");
    const controller = new AbortController();
    const waitUntilReadyForWorkspace = vi.fn().mockResolvedValue({ kind: "ready" });
    setWorkspaceLspRuntimeState("/test", {
      kind: "ready",
      runtime: { waitUntilReadyForWorkspace },
    } as unknown as WorkspaceLspRuntimeState);

    const result = await ensureSemanticReadiness("/test", { kind: "workspace" }, 100, {
      signal: controller.signal,
    });

    expect(result.kind).toBe("ready");
    expect(waitUntilReadyForWorkspace).toHaveBeenCalledWith(
      { timeoutMs: expect.any(Number) },
      { signal: controller.signal },
    );
  });

  it("rejects immediately when the caller is already aborted", async () => {
    registerReadySemantic("/test");
    const controller = new AbortController();
    controller.abort(new Error("cancelled before readiness"));

    await expect(
      ensureSemanticReadiness("/test", { kind: "workspace" }, 100, {
        signal: controller.signal,
      }),
    ).rejects.toThrow("cancelled before readiness");
  });

  it("rejects with a deadline error when the request deadline is earlier than the readiness timeout", async () => {
    vi.useFakeTimers();
    try {
      registerPendingSemantic("/test");
      setWorkspaceLspRuntimeState("/test", { kind: "pending" });

      const resultPromise = ensureSemanticReadiness("/test", { kind: "workspace" }, 200, {
        deadline: Date.now() + 50,
      });
      // Attach the rejection handler before advancing so the deadline
      // rejection is never observed as unhandled.
      const assertion = expect(resultPromise).rejects.toThrow("Code request deadline exceeded");
      // Advance beyond both the request deadline and the internal timeout so
      // the wait settles even when the deadline is not yet enforced.
      await vi.advanceTimersByTimeAsync(250);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns unavailable when a ready semantic provider has no live LSP runtime", async () => {
    registerReadySemantic("/test");

    const result = await ensureSemanticReadiness("/test", { kind: "workspace" }, 100);

    expect(result.kind).toBe("unavailable");
  });

  it("returns timeout when session service stays pending beyond the deadline", async () => {
    registerPendingSemantic("/test");
    setWorkspaceLspRuntimeState("/test", { kind: "pending" });

    const result = await ensureSemanticReadiness("/test", { kind: "workspace" }, 100);
    expect(result.kind).toBe("timeout");
  });

  it("respects a single deadline across both internal waits", async () => {
    vi.useFakeTimers();
    try {
      registerPendingSemantic("/test");
      setWorkspaceLspRuntimeState("/test", { kind: "pending" });

      // Advance most of the deadline before the session service becomes ready
      const resultPromise = ensureSemanticReadiness("/test", { kind: "workspace" }, 200);
      await vi.advanceTimersByTimeAsync(190);

      // Now make the session service ready — only 10ms of budget remains
      setWorkspaceLspRuntimeState("/test", {
        kind: "ready",
        runtime: {
          waitUntilReadyForWorkspace: vi.fn().mockResolvedValue({ kind: "ready" }),
        },
      } as unknown as WorkspaceLspRuntimeState);

      // The workspace-level wait should get at most ~10ms budget
      await vi.advanceTimersByTimeAsync(50);

      const result = await resultPromise;
      // The 200ms budget was consumed: 190ms on service wait + 10ms buffer → timeout
      expect(result.kind).toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns unavailable when the LSP service is in disabled state", async () => {
    registerPendingSemantic("/test");
    setWorkspaceLspRuntimeState("/test", { kind: "disabled" });

    const result = await ensureSemanticReadiness("/test", { kind: "workspace" }, 100);
    expect(result.kind).toBe("unavailable");
  });
});

function createMockSemanticProvider(): SemanticProvider {
  return {
    references: async () => unavailableCodeQuery("not configured"),
    implementation: async () => unavailableCodeQuery("not configured"),
    documentSymbols: async () => unavailableCodeQuery("not configured"),
    workspaceSymbols: async () => unavailableCodeQuery("not configured"),
  };
}
