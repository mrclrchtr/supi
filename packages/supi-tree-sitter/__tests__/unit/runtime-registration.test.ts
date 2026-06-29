import { type SemanticProvider, WorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { describe, expect, it, vi } from "vitest";
import {
  registerTreeSitterCapabilities,
  unregisterTreeSitterCapabilities,
} from "../../src/session/runtime-registration.ts";
import type { TreeSitterService } from "../../src/types.ts";

describe("Tree-sitter runtime registration", () => {
  it("publishes structural capability when registered with a ready TS service", () => {
    const runtime = new WorkspaceRuntime();
    const service = createMockTsService();

    registerTreeSitterCapabilities(runtime, "/project", service);

    const ws = runtime.getWorkspace("/project");
    expect(ws.structural.state.kind).toBe("ready");
    expect(ws.structural.provider).not.toBeNull();
  });

  it("does not publish semantic capability", () => {
    const runtime = new WorkspaceRuntime();
    const service = createMockTsService();

    registerTreeSitterCapabilities(runtime, "/project", service);

    const ws = runtime.getWorkspace("/project");
    expect(ws.structural.state.kind).toBe("ready");
    expect(ws.semantic.state.kind).toBe("unavailable");
  });

  it("unregisters capabilities on session shutdown", () => {
    const runtime = new WorkspaceRuntime();
    const service = createMockTsService();

    registerTreeSitterCapabilities(runtime, "/project", service);
    unregisterTreeSitterCapabilities(runtime, "/project");

    const ws = runtime.getWorkspace("/project");
    expect(ws.structural.state.kind).toBe("unavailable");
  });

  it("supports multiple cwds independently", () => {
    const runtime = new WorkspaceRuntime();
    registerTreeSitterCapabilities(runtime, "/project-a", createMockTsService());
    registerTreeSitterCapabilities(runtime, "/project-b", createMockTsService());

    expect(runtime.getWorkspace("/project-a").structural.state.kind).toBe("ready");
    expect(runtime.getWorkspace("/project-b").structural.state.kind).toBe("ready");

    unregisterTreeSitterCapabilities(runtime, "/project-a");
    expect(runtime.getWorkspace("/project-a").structural.state.kind).toBe("unavailable");
    expect(runtime.getWorkspace("/project-b").structural.state.kind).toBe("ready");
  });

  it("creates a StructuralProvider that delegates to the TreeSitterService", async () => {
    const runtime = new WorkspaceRuntime();
    const service = createMockTsService();
    const outlineSpy = vi.spyOn(service, "outline");

    registerTreeSitterCapabilities(runtime, "/project", service);
    const ws = runtime.getWorkspace("/project");
    expect(ws.structural.provider).not.toBeNull();
    const provider = ws.structural.provider as NonNullable<typeof ws.structural.provider>;

    await provider.outline("test.ts");
    expect(outlineSpy).toHaveBeenCalledWith("test.ts");
  });

  it("leaves semantic capability intact when unregistering tree-sitter alone", () => {
    const runtime = new WorkspaceRuntime();
    const lspProvider = createMockSemanticProvider();
    runtime.registerSemantic("/project", lspProvider);
    registerTreeSitterCapabilities(runtime, "/project", createMockTsService());

    unregisterTreeSitterCapabilities(runtime, "/project");

    const ws = runtime.getWorkspace("/project");
    expect(ws.structural.state.kind).toBe("unavailable");
    expect(ws.semantic.state.kind).toBe("ready");
  });

  describe("structural readiness with the shared broker", () => {
    it("preserves semantic capability slot when registering structural independently", () => {
      const runtime = new WorkspaceRuntime();
      const lspProvider = createMockSemanticProvider();
      runtime.registerSemantic("/project", lspProvider);

      registerTreeSitterCapabilities(runtime, "/project", createMockTsService());

      const ws = runtime.getWorkspace("/project");
      expect(ws.structural.state.kind).toBe("ready");
      expect(ws.semantic.state.kind).toBe("ready");
    });

    it("structural slot reports unavailable after unregister", () => {
      const runtime = new WorkspaceRuntime();
      registerTreeSitterCapabilities(runtime, "/project", createMockTsService());
      expect(runtime.getWorkspace("/project").structural.state.kind).toBe("ready");

      unregisterTreeSitterCapabilities(runtime, "/project");
      expect(runtime.getWorkspace("/project").structural.state.kind).toBe("unavailable");
    });

    it("structural registration does not add refactorAvailable to semantic slot", () => {
      const runtime = new WorkspaceRuntime();
      registerTreeSitterCapabilities(runtime, "/project", createMockTsService());

      const ws = runtime.getWorkspace("/project");
      expect(ws.semantic.state.kind).toBe("unavailable");
      expect(ws.semantic.refactorAvailable).toBe(false);
    });
  });
});

function createMockTsService(): TreeSitterService {
  return {
    canParse: vi.fn().mockResolvedValue({
      kind: "success" as const,
      data: { file: "", language: "typescript" },
    }),
    query: vi.fn().mockResolvedValue({ kind: "success" as const, data: [] }),
    outline: vi.fn().mockResolvedValue({ kind: "success" as const, data: [] }),
    imports: vi.fn().mockResolvedValue({ kind: "success" as const, data: [] }),
    exports: vi.fn().mockResolvedValue({ kind: "success" as const, data: [] }),
    nodeAt: vi.fn().mockResolvedValue({
      kind: "success" as const,
      data: {
        type: "program",
        range: { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 0 },
        text: "",
        ancestry: [],
      },
    }),
    calleesAt: vi.fn().mockResolvedValue({
      kind: "success" as const,
      data: {
        enclosingScope: {
          name: "root",
          range: { startLine: 1, startCharacter: 0, endLine: 10, endCharacter: 0 },
        },
        callees: [],
      },
    }),
    callSites: vi.fn().mockResolvedValue({ kind: "success" as const, data: [] }),
  };
}

function createMockSemanticProvider(): SemanticProvider {
  return {
    references: vi.fn().mockResolvedValue(null),
    implementation: vi.fn().mockResolvedValue(null),
    documentSymbols: vi.fn().mockResolvedValue(null),
    workspaceSymbols: vi.fn().mockResolvedValue(null),
  };
}
