import { afterEach, describe, expect, it } from "vitest";
import type { SemanticProvider, StructuralProvider } from "../../src/capability/types.ts";
import type { CodeLocation, CodePosition, CodeSymbol } from "../../src/types.ts";
import { WorkspaceRuntime } from "../../src/workspace/runtime.ts";

// biome-ignore lint/security/noSecrets: test suite name detected as high-entropy
describe("WorkspaceRuntime", () => {
  let runtime: WorkspaceRuntime;

  afterEach(() => {
    runtime?.clearAll();
  });

  describe("base state", () => {
    it("returns unavailable for an unknown cwd", () => {
      runtime = new WorkspaceRuntime();
      const ws = runtime.getWorkspace("/unknown");
      expect(ws).not.toBeNull();
      expect(ws?.semantic.state.kind).toBe("unavailable");
      expect(ws?.structural.state.kind).toBe("unavailable");
    });
  });

  describe("cwd isolation", () => {
    it("workspace state is keyed by cwd", () => {
      runtime = new WorkspaceRuntime();
      const provider = createMockSemanticProvider();

      runtime.registerSemantic("/project-a", provider);
      expect(runtime.getWorkspace("/project-a")?.semantic.state.kind).toBe("ready");

      // Unrelated cwd stays unavailable
      const wsB = runtime.getWorkspace("/project-b");
      expect(wsB?.semantic.state.kind).toBe("unavailable");
      expect(wsB?.structural.state.kind).toBe("unavailable");
    });

    it("clearing one workspace does not affect another", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerSemantic("/project-a", createMockSemanticProvider());
      runtime.registerStructural("/project-b", createMockStructuralProvider());

      runtime.clearWorkspace("/project-a");

      expect(runtime.getWorkspace("/project-a")?.semantic.state.kind).toBe("unavailable");
      // /project-b is untouched
      expect(runtime.getWorkspace("/project-b")?.structural.state.kind).toBe("ready");
    });

    it("clearing all workspaces resets everything", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerSemantic("/project-a", createMockSemanticProvider());
      runtime.registerStructural("/project-b", createMockStructuralProvider());

      runtime.clearAll();

      expect(runtime.getWorkspace("/project-a")?.semantic.state.kind).toBe("unavailable");
      expect(runtime.getWorkspace("/project-b")?.structural.state.kind).toBe("unavailable");
    });
  });

  describe("independent capability registration", () => {
    it("allows registering semantic capability independently", () => {
      runtime = new WorkspaceRuntime();
      const provider = createMockSemanticProvider();

      runtime.registerSemantic("/project", provider);
      const ws = runtime.getWorkspace("/project");

      expect(ws?.semantic.state.kind).toBe("ready");
      expect(ws?.semantic.provider).toBe(provider);
      expect(ws?.structural.state.kind).toBe("unavailable");
      expect(ws?.structural.provider).toBeNull();
    });

    it("allows registering structural capability independently", () => {
      runtime = new WorkspaceRuntime();
      const provider = createMockStructuralProvider();

      runtime.registerStructural("/project", provider);
      const ws = runtime.getWorkspace("/project");

      expect(ws?.structural.state.kind).toBe("ready");
      expect(ws?.structural.provider).toBe(provider);
      expect(ws?.semantic.state.kind).toBe("unavailable");
      expect(ws?.semantic.provider).toBeNull();
    });

    it("supports both capabilities registered separately", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerSemantic("/project", createMockSemanticProvider());
      runtime.registerStructural("/project", createMockStructuralProvider());

      const ws = runtime.getWorkspace("/project");
      expect(ws?.semantic.state.kind).toBe("ready");
      expect(ws?.structural.state.kind).toBe("ready");
    });
  });

  describe("state transitions", () => {
    it("keeps ready state for registered semantic capability", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerSemantic("/project", createMockSemanticProvider());
      expect(runtime.getWorkspace("/project")?.semantic.state.kind).toBe("ready");
    });

    it("supports pending semantic registration before promotion to ready", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerSemanticPending("/project", createMockSemanticProvider());
      expect(runtime.getWorkspace("/project")?.semantic.state.kind).toBe("pending");

      runtime.markSemanticReady("/project");
      expect(runtime.getWorkspace("/project")?.semantic.state.kind).toBe("ready");
    });

    it("transitions back to unavailable after clearing", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerSemantic("/project", createMockSemanticProvider());
      runtime.clearWorkspace("/project");
      expect(runtime.getWorkspace("/project")?.semantic.state.kind).toBe("unavailable");
    });
  });

  describe("refactor availability", () => {
    it("semantic slot exposes refactorAvailable indicator", () => {
      runtime = new WorkspaceRuntime();
      const provider = createMockSemanticProvider();
      runtime.registerSemantic("/project", provider);
      const ws = runtime.getWorkspace("/project");
      // refactorAvailable must exist and be boolean
      expect(typeof ws.semantic.refactorAvailable).toBe("boolean");
    });
  });

  describe("re-registration", () => {
    it("replaces an existing semantic provider on re-registration", () => {
      runtime = new WorkspaceRuntime();
      const first = createMockSemanticProvider();
      const second = createMockSemanticProvider();

      runtime.registerSemantic("/project", first);
      expect(runtime.getWorkspace("/project")?.semantic.provider).toBe(first);

      runtime.registerSemantic("/project", second);
      expect(runtime.getWorkspace("/project")?.semantic.provider).toBe(second);
    });
  });

  describe("clearSemantic", () => {
    it("clears only the semantic slot, leaves structural untouched", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerSemantic("/project", createMockSemanticProvider());
      runtime.registerStructural("/project", createMockStructuralProvider());

      runtime.clearSemantic("/project");
      const ws = runtime.getWorkspace("/project");
      expect(ws?.semantic.state.kind).toBe("unavailable");
      expect(ws?.semantic.provider).toBeNull();
      expect(ws?.structural.state.kind).toBe("ready");
      expect(ws?.structural.provider).not.toBeNull();
    });

    it("removes the Map entry when both slots become unavailable", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerSemantic("/project", createMockSemanticProvider());
      // No structural registered — it's already unavailable by default

      runtime.clearSemantic("/project");
      const ws = runtime.getWorkspace("/project");
      // Both slots unavailable → entry removed, getWorkspace returns a fresh default
      expect(ws?.semantic.state.kind).toBe("unavailable");
      expect(ws?.structural.state.kind).toBe("unavailable");
    });

    it("is a no-op on a cwd that was never registered", () => {
      runtime = new WorkspaceRuntime();
      runtime.clearSemantic("/never-registered");
      const ws = runtime.getWorkspace("/never-registered");
      expect(ws?.semantic.state.kind).toBe("unavailable");
    });
  });

  describe("clearStructural", () => {
    it("clears only the structural slot, leaves semantic untouched", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerSemantic("/project", createMockSemanticProvider());
      runtime.registerStructural("/project", createMockStructuralProvider());

      runtime.clearStructural("/project");
      const ws = runtime.getWorkspace("/project");
      expect(ws?.structural.state.kind).toBe("unavailable");
      expect(ws?.structural.provider).toBeNull();
      expect(ws?.semantic.state.kind).toBe("ready");
      expect(ws?.semantic.provider).not.toBeNull();
    });
  });
});

// ── Mock helpers ──────────────────────────────────────────────────────

function createMockSemanticProvider(): SemanticProvider {
  return {
    references: async (_file: string, _pos: CodePosition): Promise<CodeLocation[] | null> => null,
    implementation: async (_file: string, _pos: CodePosition): Promise<CodeLocation[] | null> =>
      null,
    documentSymbols: async (_file: string): Promise<CodeSymbol[] | null> => null,
    workspaceSymbols: async (_query: string): Promise<CodeSymbol[] | null> => null,
  };
}

function createMockStructuralProvider(): StructuralProvider {
  return {
    calleesAt: async (_file: string, _line: number, _char: number) =>
      ({ kind: "unsupported-language", file: _file, message: "mock" }) as const,
    exports: async (_file: string) =>
      ({ kind: "unsupported-language", file: _file, message: "mock" }) as const,
    outline: async (_file: string) =>
      ({ kind: "unsupported-language", file: _file, message: "mock" }) as const,
    imports: async (_file: string) =>
      ({ kind: "unsupported-language", file: _file, message: "mock" }) as const,
    nodeAt: async (_file: string, _line: number, _char: number) =>
      ({ kind: "unsupported-language", file: _file, message: "mock" }) as const,
  };
}
