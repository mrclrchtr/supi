import { describe, expect, it } from "vitest";

/**
 * Affected service tests.
 */
describe("affected service", () => {
  it("returns typed affected result", async () => {
    const { executeAffectedService } = await import("../../../src/analysis/affected/service.ts");

    const result = await executeAffectedService({
      file: "/project/src/file.ts",
      line: 10,
      character: 5,
      cwd: "/project",
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.details).toBeDefined();
  });

  it("handles unavailable state", async () => {
    const { executeAffectedService } = await import("../../../src/analysis/affected/service.ts");

    const result = await executeAffectedService({
      cwd: "/project",
    });

    expect(result.details?.type).toBe("affected");
  });
});
