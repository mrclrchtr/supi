import { describe, expect, it } from "vitest";

/**
 * Public API surface tests for @mrclrchtr/supi-tree-sitter.
 *
 * Verifies the exported surface exposes structured runtime/service APIs
 * only and does NOT require tool-handler exports.
 */
describe("supi-tree-sitter API surface", () => {
  it("exports TreeSitterRuntime", async () => {
    const api = await import("@mrclrchtr/supi-tree-sitter/api");
    expect(api.TreeSitterRuntime).toBeDefined();
  });

  it("exports TreeSitterRuntimeController", async () => {
    const api = await import("@mrclrchtr/supi-tree-sitter/api");
    expect(api.TreeSitterRuntimeController).toBeDefined();
  });

  it("exports getSessionTreeSitterService", async () => {
    const api = await import("@mrclrchtr/supi-tree-sitter/api");
    expect(typeof api.getSessionTreeSitterService).toBe("function");
  });

  it("exports createTreeSitterSession", async () => {
    const api = await import("@mrclrchtr/supi-tree-sitter/api");
    expect(typeof api.createTreeSitterSession).toBe("function");
  });

  it("does NOT export handler functions (library-only boundary)", async () => {
    const api = await import("@mrclrchtr/supi-tree-sitter/api");
    // The public API should not expose tool-handler string-formatting functions
    // Use bracket access to avoid TS errors on undefined properties
    const exported: Record<string, unknown> = api;
    expect(exported.handleOutline).toBeUndefined();
    expect(exported.handleCallees).toBeUndefined();
    expect(exported.handleExports).toBeUndefined();
    expect(exported.handleImports).toBeUndefined();
    expect(exported.handleNodeAt).toBeUndefined();
    expect(exported.handleQuery).toBeUndefined();
  });

  it("exports structural extraction functions from api.ts", async () => {
    const api = await import("@mrclrchtr/supi-tree-sitter/api");
    expect(typeof api.lookupCalleesAt).toBe("function");
    expect(typeof api.collectOutline).toBe("function");
    expect(typeof api.detectGrammar).toBe("function");
  });
});
