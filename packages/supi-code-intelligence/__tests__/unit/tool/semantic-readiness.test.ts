import type { SemanticProvider } from "@mrclrchtr/supi-code-runtime/api";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import {
  clearSessionLspService,
  type SessionLspServiceState,
  setSessionLspServiceState,
} from "@mrclrchtr/supi-lsp/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureSemanticReadiness,
  renderSemanticReadinessTimeout,
} from "../../../src/tool/semantic-readiness.ts";

describe("ensureSemanticReadiness", () => {
  afterEach(() => {
    getDefaultWorkspaceRuntime().clearAll();
    clearSessionLspService("/test");
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

  it("returns ready immediately when semantic state is already ready", async () => {
    registerReadySemantic("/test");
    const result = await ensureSemanticReadiness("/test", { kind: "workspace" }, 100);
    expect(result.kind).toBe("ready");
  });

  it("returns timeout when session service stays pending beyond the deadline", async () => {
    registerPendingSemantic("/test");
    setSessionLspServiceState("/test", { kind: "pending" });

    const result = await ensureSemanticReadiness("/test", { kind: "workspace" }, 100);
    expect(result.kind).toBe("timeout");
  });

  it("respects a single deadline across both internal waits", async () => {
    vi.useFakeTimers();
    try {
      registerPendingSemantic("/test");
      setSessionLspServiceState("/test", { kind: "pending" });

      // Advance most of the deadline before the session service becomes ready
      const resultPromise = ensureSemanticReadiness("/test", { kind: "workspace" }, 200);
      await vi.advanceTimersByTimeAsync(190);

      // Now make the session service ready — only 10ms of budget remains
      setSessionLspServiceState("/test", {
        kind: "ready",
        service: {
          waitUntilReadyForWorkspace: vi.fn().mockResolvedValue({ kind: "ready" }),
        },
      } as unknown as SessionLspServiceState);

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
    setSessionLspServiceState("/test", { kind: "disabled" });

    const result = await ensureSemanticReadiness("/test", { kind: "workspace" }, 100);
    expect(result.kind).toBe("unavailable");
  });
});

describe("renderSemanticReadinessTimeout", () => {
  it("includes the tool name and rounded seconds", () => {
    const msg = renderSemanticReadinessTimeout("code_graph", 15_000);
    expect(msg).toContain("code_graph");
    expect(msg).toContain("15s");
  });

  it("rounds up sub-second timeouts to 1s", () => {
    const msg = renderSemanticReadinessTimeout("code_find", 500);
    expect(msg).toContain("1s");
  });
});

function createMockSemanticProvider(): SemanticProvider {
  return {
    references: async () => null,
    implementation: async () => null,
    documentSymbols: async () => null,
    workspaceSymbols: async () => null,
  };
}
