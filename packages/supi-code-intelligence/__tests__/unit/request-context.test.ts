import type {
  SemanticProvider,
  StructuralProvider,
  WorkspaceContext,
} from "@mrclrchtr/supi-code-runtime/api";
import { describe, expect, it } from "vitest";

describe("WorkspaceContext reuse", () => {
  it("SemanticProvider and SemanticSubstrate are compatible", () => {
    // Verify that SemanticProvider can be used where SemanticSubstrate is expected
    const provider: SemanticProvider = {
      references: async () => null,
      implementation: async () => null,
      documentSymbols: async () => null,
      workspaceSymbols: async () => null,
    };
    // The code-intelligence SemanticSubstrate has the same shape
    const substrate: import("../../src/substrates/types.ts").SemanticSubstrate = provider;
    expect(typeof substrate.references).toBe("function");
  });

  it("StructuralProvider and StructuralSubstrate are compatible", () => {
    const provider: StructuralProvider = {
      calleesAt: async () => ({ kind: "unavailable" as const, message: "" }),
      exports: async () => ({ kind: "unavailable" as const, message: "" }),
      outline: async () => ({ kind: "unavailable" as const, message: "" }),
      imports: async () => ({ kind: "unavailable" as const, message: "" }),
      nodeAt: async () => ({ kind: "unavailable" as const, message: "" }),
    };
    const substrate: import("../../src/substrates/types.ts").StructuralSubstrate = provider;
    expect(typeof substrate.calleesAt).toBe("function");
  });

  it("WorkspaceContext carries model, semantic, and structural", () => {
    const ctx: WorkspaceContext = {
      cwd: "/project",
      model: null,
      semantic: { state: { kind: "unavailable", reason: "" }, provider: null },
      structural: { state: { kind: "unavailable", reason: "" }, provider: null },
    };
    expect(ctx.cwd).toBe("/project");
    expect(ctx.semantic.state.kind).toBe("unavailable");
    expect(ctx.structural.state.kind).toBe("unavailable");
  });
});
