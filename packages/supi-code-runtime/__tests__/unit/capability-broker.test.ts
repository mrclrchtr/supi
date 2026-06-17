import { afterEach, describe, expect, it } from "vitest";
import type { SemanticProvider, StructuralProvider } from "../../src/capability/types.ts";
import type { CodeLocation, CodePosition, CodeSymbol } from "../../src/types.ts";
import { WorkspaceRuntime } from "../../src/workspace/runtime.ts";

describe("capability-broker", () => {
  let runtime: WorkspaceRuntime;

  afterEach(() => {
    runtime?.clearAll();
  });

  describe("independent capability registration", () => {
    it("allows registering semantic capability independently of structural", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerSemantic("/project", createMockSemanticProvider());
      const ws = runtime.getWorkspace("/project");

      expect(ws.semantic.state.kind).toBe("ready");
      expect(ws.semantic.provider).not.toBeNull();
      expect(ws.structural.state.kind).toBe("unavailable");
      expect(ws.structural.provider).toBeNull();
    });

    it("allows registering structural capability independently of semantic", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerStructural("/project", createMockStructuralProvider());
      const ws = runtime.getWorkspace("/project");

      expect(ws.structural.state.kind).toBe("ready");
      expect(ws.structural.provider).not.toBeNull();
      expect(ws.semantic.state.kind).toBe("unavailable");
      expect(ws.semantic.provider).toBeNull();
    });

    it("supports both capabilities registered separately for same cwd", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerSemantic("/project", createMockSemanticProvider());
      runtime.registerStructural("/project", createMockStructuralProvider());

      const ws = runtime.getWorkspace("/project");
      expect(ws.semantic.state.kind).toBe("ready");
      expect(ws.structural.state.kind).toBe("ready");
    });
  });

  describe("slot isolation", () => {
    it("replacing semantic slot does not affect structural slot", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerSemantic("/project", createMockSemanticProvider());
      runtime.registerStructural("/project", createMockStructuralProvider());

      runtime.registerSemantic("/project", createMockSemanticProvider());
      const ws = runtime.getWorkspace("/project");
      expect(ws.semantic.state.kind).toBe("ready");
      expect(ws.structural.state.kind).toBe("ready");
      expect(ws.structural.provider).not.toBeNull();
    });

    it("clearing semantic slot does not affect structural slot", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerSemantic("/project", createMockSemanticProvider());
      runtime.registerStructural("/project", createMockStructuralProvider());

      runtime.clearSemantic("/project");
      const ws = runtime.getWorkspace("/project");
      expect(ws.semantic.state.kind).toBe("unavailable");
      expect(ws.structural.state.kind).toBe("ready");
    });

    it("clearing structural slot does not affect semantic slot", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerSemantic("/project", createMockSemanticProvider());
      runtime.registerStructural("/project", createMockStructuralProvider());

      runtime.clearStructural("/project");
      const ws = runtime.getWorkspace("/project");
      expect(ws.structural.state.kind).toBe("unavailable");
      expect(ws.semantic.state.kind).toBe("ready");
    });
  });

  describe("explicit availability states", () => {
    it("returns unavailable for unknown cwd", () => {
      runtime = new WorkspaceRuntime();
      const ws = runtime.getWorkspace("/unknown");
      expect(ws.semantic.state.kind).toBe("unavailable");
      expect(ws.structural.state.kind).toBe("unavailable");
    });

    it("returns ready after registering semantic provider", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerSemantic("/project", createMockSemanticProvider());
      expect(runtime.getWorkspace("/project").semantic.state.kind).toBe("ready");
    });

    it("returns ready after registering structural provider", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerStructural("/project", createMockStructuralProvider());
      expect(runtime.getWorkspace("/project").structural.state.kind).toBe("ready");
    });

    it("transitions back to unavailable after clearWorkspace", () => {
      runtime = new WorkspaceRuntime();
      runtime.registerSemantic("/project", createMockSemanticProvider());
      runtime.clearWorkspace("/project");
      expect(runtime.getWorkspace("/project").semantic.state.kind).toBe("unavailable");
    });
  });

  describe("refactor availability metadata", () => {
    it("reports refactorAvailable=false when semantic provider lacks rename/codeActions", () => {
      runtime = new WorkspaceRuntime();
      const noRefactorProvider: SemanticProvider = {
        references: async () => null,
        implementation: async () => null,
        documentSymbols: async () => [],
        workspaceSymbols: async () => [],
        // No rename or codeActions
      };
      runtime.registerSemantic("/project", noRefactorProvider);
      expect(runtime.getWorkspace("/project").semantic.refactorAvailable).toBe(false);
    });

    it("reports refactorAvailable=true when semantic provider has rename", () => {
      runtime = new WorkspaceRuntime();
      const refactorProvider: SemanticProvider = {
        references: async () => null,
        implementation: async () => null,
        documentSymbols: async () => [],
        workspaceSymbols: async () => [],
        rename: async (_file, _pos, _newName) => ({
          kind: "precise" as const,
          edits: { edits: [] },
        }),
      };
      runtime.registerSemantic("/project", refactorProvider);
      expect(runtime.getWorkspace("/project").semantic.refactorAvailable).toBe(true);
    });

    it("reports refactorAvailable=true when semantic provider has codeActions", () => {
      runtime = new WorkspaceRuntime();
      const refactorProvider: SemanticProvider = {
        references: async () => null,
        implementation: async () => null,
        documentSymbols: async () => [],
        workspaceSymbols: async () => [],
        codeActions: async (_file, _pos) => [{ kind: "precise" as const, edits: { edits: [] } }],
      };
      runtime.registerSemantic("/project", refactorProvider);
      expect(runtime.getWorkspace("/project").semantic.refactorAvailable).toBe(true);
    });

    it("reports refactorAvailable=true when semantic provider has refactor", () => {
      runtime = new WorkspaceRuntime();
      const refactorProvider: SemanticProvider = {
        references: async () => null,
        implementation: async () => null,
        documentSymbols: async () => [],
        workspaceSymbols: async () => [],
        refactor: async (_request) => ({ kind: "precise" as const, edits: { edits: [] } }),
      };
      runtime.registerSemantic("/project", refactorProvider);
      expect(runtime.getWorkspace("/project").semantic.refactorAvailable).toBe(true);
    });

    it("refactorAvailable is false when no semantic provider is registered", () => {
      runtime = new WorkspaceRuntime();
      expect(runtime.getWorkspace("/project").semantic.refactorAvailable).toBe(false);
    });

    it("refactorAvailable resets to false after semantic clearance clears a refactor-capable provider", () => {
      runtime = new WorkspaceRuntime();
      const refactorProvider: SemanticProvider = {
        references: async () => null,
        implementation: async () => null,
        documentSymbols: async () => [],
        workspaceSymbols: async () => [],
        rename: async (_file, _pos, _newName) => ({
          kind: "precise" as const,
          edits: { edits: [] },
        }),
      };
      runtime.registerSemantic("/project", refactorProvider);
      expect(runtime.getWorkspace("/project").semantic.refactorAvailable).toBe(true);

      runtime.clearSemantic("/project");
      expect(runtime.getWorkspace("/project").semantic.refactorAvailable).toBe(false);
    });
  });
});

// ── Mock helpers ──────────────────────────────────────────────────────

function createMockSemanticProvider(): SemanticProvider {
  return {
    references: async (_file: string, _pos: CodePosition): Promise<CodeLocation[] | null> => null,
    implementation: async (_file: string, _pos: CodePosition): Promise<CodeLocation[] | null> =>
      null,
    documentSymbols: async (_file: string): Promise<CodeSymbol[] | null> => [],
    workspaceSymbols: async (_query: string): Promise<CodeSymbol[] | null> => [],
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
    callSites: async (_file: string) =>
      ({ kind: "unsupported-language", file: _file, message: "mock" }) as const,
  };
}
