import { afterEach, describe, expect, it } from "vitest";
import type { SemanticProvider, StructuralProvider } from "../../src/capability/types.ts";
import type { CodeLocation, CodePosition, CodeSymbol } from "../../src/types.ts";
import { createWorkspaceContext } from "../../src/workspace/context.ts";
import { WorkspaceRuntime } from "../../src/workspace/runtime.ts";

describe("WorkspaceContext", () => {
  let runtime: WorkspaceRuntime;

  afterEach(() => {
    runtime?.clearAll();
  });

  it("returns both capabilities when both are available", () => {
    runtime = new WorkspaceRuntime();
    runtime.registerSemantic("/project", createMockSemanticProvider());
    runtime.registerStructural("/project", createMockStructuralProvider());

    const ctx = createWorkspaceContext("/project", runtime);
    expect(ctx.cwd).toBe("/project");
    expect(ctx.semantic.state.kind).toBe("ready");
    expect(ctx.semantic.provider).not.toBeNull();
    expect(ctx.structural.state.kind).toBe("ready");
    expect(ctx.structural.provider).not.toBeNull();
  });

  it("returns null provider when only structural is available", () => {
    runtime = new WorkspaceRuntime();
    runtime.registerStructural("/project", createMockStructuralProvider());

    const ctx = createWorkspaceContext("/project", runtime);
    expect(ctx.semantic.state.kind).toBe("unavailable");
    expect(ctx.semantic.provider).toBeNull();
    expect(ctx.structural.state.kind).toBe("ready");
    expect(ctx.structural.provider).not.toBeNull();
  });

  it("returns unavailable state when no capabilities are registered", () => {
    runtime = new WorkspaceRuntime();
    const ctx = createWorkspaceContext("/empty", runtime);
    expect(ctx.semantic.state.kind).toBe("unavailable");
    expect(ctx.structural.state.kind).toBe("unavailable");
  });

  it("reflects the correct cwd", () => {
    runtime = new WorkspaceRuntime();
    runtime.registerSemantic("/project", createMockSemanticProvider());
    const ctx = createWorkspaceContext("/project", runtime);
    expect(ctx.cwd).toBe("/project");
  });

  it("reflects updated state after clearing a workspace", () => {
    runtime = new WorkspaceRuntime();
    runtime.registerSemantic("/project", createMockSemanticProvider());
    runtime.clearWorkspace("/project");

    const ctx = createWorkspaceContext("/project", runtime);
    expect(ctx.semantic.state.kind).toBe("unavailable");
    expect(ctx.semantic.provider).toBeNull();
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
