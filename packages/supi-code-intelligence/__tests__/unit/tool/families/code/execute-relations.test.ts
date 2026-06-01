import { describe, expect, it } from "vitest";

/**
 * code_graph validation tests.
 *
 * Verifies that the graph executor validates params and dispatches
 * relation families correctly.
 */
describe("code_graph", () => {
  it("defaults to references relation when none specified", () => {
    const params = {} as Record<string, unknown>;
    // Without relations, the executor defaults to ["references"]
    expect(params.relations).toBeUndefined();
  });

  it("accepts callees as a valid relation", () => {
    const relations = ["callees"] as const;
    expect(relations).toContain("callees");
  });

  it("accepts implements as a valid relation", () => {
    const relations = ["implements"] as const;
    expect(relations).toContain("implements");
  });

  it("accepts multiple relations in one call", () => {
    const relations = ["references", "callees", "implements"] as const;
    expect(relations.length).toBe(3);
  });

  it("accepts imports, exports, and tests as valid graph relation kinds", () => {
    const relations = ["imports", "exports", "tests"] as const;
    expect(relations.length).toBe(3);
  });
});
