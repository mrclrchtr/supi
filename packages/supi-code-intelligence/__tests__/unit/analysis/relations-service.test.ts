import { describe, expect, it } from "vitest";

/**
 * Relations service tests.
 */
describe("relations service", () => {
  it("returns typed caller relations from callers module", async () => {
    const { collectCallers } = await import("../../../src/tool/graph/references.ts");

    const result = await collectCallers(
      "/project/src/file.ts",
      { line: 10, character: 5 },
      "myFunction",
      { cwd: "/project", provider: null },
    );

    expect(result.kind).toBe("callers");
    expect(result.confidence).toBe("unavailable");
  });

  it("returns typed implementation relations from implementations module", async () => {
    const { collectImplementations } = await import("../../../src/tool/graph/implementations.ts");

    const result = await collectImplementations(
      "/project/src/file.ts",
      { line: 10, character: 5 },
      "InterfaceX",
      { cwd: "/project", provider: null },
    );

    expect(result.kind).toBe("implementations");
  });

  it("returns typed callee relations from callees module", async () => {
    const { collectCallees } = await import("../../../src/tool/graph/callees.ts");

    const result = await collectCallees("/project/src/file.ts", 10, 5, "myFunction", {
      cwd: "/project",
      provider: null,
    });

    expect(result.kind).toBe("callees");
  });
});
