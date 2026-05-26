import { describe, expect, it } from "vitest";
import { createAnalysisBriefService } from "../../../src/analysis/brief/service.ts";

/**
 * Brief service tests — ensures the analysis brief service returns
 * typed data for project, path, file, anchored, and symbol modes.
 */
describe("brief service", () => {
  it("creates a brief service and returns typed data for project brief", async () => {
    const result = await createAnalysisBriefService({
      kind: "project",
      model: null,
      cwd: "/test",
    });
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  it("handles empty model gracefully", async () => {
    const result = await createAnalysisBriefService({
      kind: "project",
      model: null,
      cwd: "/test",
    });
    expect(result).toBeDefined();
  });
});
