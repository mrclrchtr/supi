import { afterEach, describe, expect, it } from "vitest";
import type { SemanticProvider, StructuralProvider } from "../../src/capability/types.ts";
import { completedCodeQuery, unavailableCodeQuery } from "../../src/query-result.ts";
import type {
  CodeLocation,
  CodePosition,
  CodeSymbol,
  DocumentCodeSymbol,
} from "../../src/types.ts";
import { WorkspaceRuntime } from "../../src/workspace/runtime.ts";

describe("capability-broker", () => {
  let runtime: WorkspaceRuntime;

  afterEach(() => {
    runtime?.clearAll();
  });

  it("replacing the semantic provider preserves the structural provider", () => {
    runtime = new WorkspaceRuntime();
    const structural = createMockStructuralProvider();
    runtime.registerSemantic("/project", createMockSemanticProvider());
    runtime.registerStructural("/project", structural);
    const replacement = createMockSemanticProvider();

    runtime.registerSemantic("/project", replacement);

    const ws = runtime.getWorkspace("/project");
    expect(ws.semantic.state.kind).toBe("ready");
    expect(ws.semantic.provider).toBe(replacement);
    expect(ws.structural.state.kind).toBe("ready");
    expect(ws.structural.provider).toBe(structural);
  });

  describe("refactor availability metadata", () => {
    it("reports refactorAvailable=false when semantic provider lacks rename/codeActions", () => {
      runtime = new WorkspaceRuntime();
      const noRefactorProvider: SemanticProvider = createMockSemanticProvider();
      runtime.registerSemantic("/project", noRefactorProvider);
      expect(runtime.getWorkspace("/project").semantic.refactorAvailable).toBe(false);
    });

    it("reports refactorAvailable=true when semantic provider has rename", () => {
      runtime = new WorkspaceRuntime();
      const refactorProvider: SemanticProvider = {
        ...createMockSemanticProvider(),
        rename: async (_file, _pos, _newName) => ({
          kind: "precise" as const,
          edits: { edits: [] },
          authorizedMutationRoots: ["/project"],
        }),
      };
      runtime.registerSemantic("/project", refactorProvider);
      expect(runtime.getWorkspace("/project").semantic.refactorAvailable).toBe(true);
    });

    it("reports refactorAvailable=true when semantic provider has codeActions", () => {
      runtime = new WorkspaceRuntime();
      const refactorProvider: SemanticProvider = {
        ...createMockSemanticProvider(),
        codeActions: async (_file, _pos) => [
          {
            kind: "precise" as const,
            edits: { edits: [] },
            authorizedMutationRoots: ["/project"],
          },
        ],
      };
      runtime.registerSemantic("/project", refactorProvider);
      expect(runtime.getWorkspace("/project").semantic.refactorAvailable).toBe(true);
    });

    it("reports refactorAvailable=true when semantic provider has refactor", () => {
      runtime = new WorkspaceRuntime();
      const refactorProvider: SemanticProvider = {
        ...createMockSemanticProvider(),
        refactor: async (_request) => ({
          kind: "precise" as const,
          edits: { edits: [] },
          authorizedMutationRoots: ["/project"],
        }),
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
        ...createMockSemanticProvider(),
        rename: async (_file, _pos, _newName) => ({
          kind: "precise" as const,
          edits: { edits: [] },
          authorizedMutationRoots: ["/project"],
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
    references: async (_file: string, _pos: CodePosition) =>
      unavailableCodeQuery<CodeLocation[]>("not configured"),
    implementation: async (_file: string, _pos: CodePosition) =>
      unavailableCodeQuery<CodeLocation[]>("not configured"),
    documentSymbols: async (_file: string) => completedCodeQuery<DocumentCodeSymbol[]>([]),
    workspaceSymbols: async (_query: string) => completedCodeQuery<CodeSymbol[]>([]),
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
