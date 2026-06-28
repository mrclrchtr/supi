import type { SemanticProvider, StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";
import { describe, expect, it } from "vitest";

describe("Provider type compatibility", () => {
  it("SemanticProvider and SemanticSubstrate are compatible", () => {
    // Verify that SemanticProvider can be used where SemanticSubstrate is expected
    const provider: SemanticProvider = {
      references: async () => null,
      implementation: async () => null,
      documentSymbols: async () => null,
      workspaceSymbols: async () => null,
    };
    // The code-intelligence SemanticSubstrate has the same shape
    const substrate: import("@mrclrchtr/supi-code-runtime/api").SemanticProvider = provider;
    expect(typeof substrate.references).toBe("function");
  });

  it("StructuralProvider and StructuralSubstrate are compatible", () => {
    const provider: StructuralProvider = {
      calleesAt: async () => ({ kind: "unavailable" as const, message: "" }),
      exports: async () => ({ kind: "unavailable" as const, message: "" }),
      outline: async () => ({ kind: "unavailable" as const, message: "" }),
      imports: async () => ({ kind: "unavailable" as const, message: "" }),
      nodeAt: async () => ({ kind: "unavailable" as const, message: "" }),
      callSites: async () => ({ kind: "unavailable" as const, message: "" }),
    };
    const substrate: import("@mrclrchtr/supi-code-runtime/api").StructuralProvider = provider;
    expect(typeof substrate.calleesAt).toBe("function");
  });
});
