import {
  completedCodeQuery,
  getDefaultWorkspaceRuntime,
  type SemanticProvider,
  type StructuralProvider,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceCapabilityAdapter } from "../../../src/session/capability-adapter.ts";
import { TestCapabilityAdapter } from "../../helpers/test-capability-adapter.ts";

function semanticProvider(references: SemanticProvider["references"]): SemanticProvider {
  return {
    references,
    implementation: async () => unavailableCodeQuery("not configured"),
    documentSymbols: async () => unavailableCodeQuery("not configured"),
    workspaceSymbols: async () => unavailableCodeQuery("not configured"),
  };
}

function structuralProvider(outline: StructuralProvider["outline"]): StructuralProvider {
  const unavailable = async () => ({ kind: "unavailable" as const, message: "not configured" });
  return {
    calleesAt: unavailable,
    exports: unavailable,
    outline,
    imports: unavailable,
    nodeAt: unavailable,
    callSites: unavailable,
  };
}

describe("capability adapter request control", () => {
  beforeEach(() => getDefaultWorkspaceRuntime().clearAll());

  it("preserves exact control through the production adapter", async () => {
    const references = vi.fn().mockResolvedValue(completedCodeQuery([]));
    const outline = vi.fn().mockResolvedValue({ kind: "success" as const, data: [] });
    getDefaultWorkspaceRuntime().registerSemantic("/project", semanticProvider(references));
    getDefaultWorkspaceRuntime().registerStructural("/project", structuralProvider(outline));
    const provider = new WorkspaceCapabilityAdapter().getProvider("/project");
    if (!provider) throw new Error("Expected provider");
    const control = { signal: new AbortController().signal, deadline: 42 };

    await provider.references("test.ts", { line: 0, character: 0 }, control);
    await provider.outline("test.ts", control);

    expect(references).toHaveBeenCalledWith("test.ts", { line: 0, character: 0 }, control);
    expect(references.mock.calls[0]?.[2]).toBe(control);
    expect(outline).toHaveBeenCalledWith("test.ts", control);
    expect(outline.mock.calls[0]?.[1]).toBe(control);
  });

  it("keeps omitted request control source-compatible", async () => {
    const references = vi.fn().mockResolvedValue(completedCodeQuery([]));
    const outline = vi.fn().mockResolvedValue({ kind: "success" as const, data: [] });
    const provider = new TestCapabilityAdapter({
      semantic: semanticProvider(references),
      structural: structuralProvider(outline),
    }).getProvider("/project");
    if (!provider) throw new Error("Expected provider");

    await provider.references("test.ts", { line: 0, character: 0 });
    await provider.outline("test.ts");

    expect(references).toHaveBeenCalledWith("test.ts", { line: 0, character: 0 });
    expect(outline).toHaveBeenCalledWith("test.ts");
  });

  it("preserves exact control through the in-memory adapter", async () => {
    const references = vi.fn().mockResolvedValue(completedCodeQuery([]));
    const outline = vi.fn().mockResolvedValue({ kind: "success" as const, data: [] });
    const provider = new TestCapabilityAdapter({
      semantic: semanticProvider(references),
      structural: structuralProvider(outline),
    }).getProvider("/project");
    if (!provider) throw new Error("Expected provider");
    const control = { signal: new AbortController().signal, deadline: 42 };

    await provider.references("test.ts", { line: 0, character: 0 }, control);
    await provider.outline("test.ts", control);

    expect(references).toHaveBeenCalledWith("test.ts", { line: 0, character: 0 }, control);
    expect(references.mock.calls[0]?.[2]).toBe(control);
    expect(outline).toHaveBeenCalledWith("test.ts", control);
    expect(outline.mock.calls[0]?.[1]).toBe(control);
  });
});
