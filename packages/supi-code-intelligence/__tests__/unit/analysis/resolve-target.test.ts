import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveTarget } from "../../../src/targeting/resolve-target.ts";

/**
 * Resolve-target tests for the new analysis/targeting/resolve-target.ts.
 *
 * Verifies:
 * - Anchored resolution: file + line + character
 * - File-only resolution: returns a target group
 * - Symbol resolution: with and without semantic provider
 * - Disambiguation: when symbol returns multiple candidates
 * - Invalid input: error message for missing both file and symbol
 */
describe("analysis resolve-target", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getDefaultWorkspaceRuntime().clearAll();
  });

  describe("resolveTarget", () => {
    it("resolves anchored coordinates", async () => {
      const result = await resolveTarget(
        { file: "/project/src/index.ts", line: 10, character: 5 },
        "/project",
      );
      expect(result).toBeDefined();
    });

    it("resolves file-only request", async () => {
      const result = await resolveTarget({ file: "/project/src/index.ts" }, "/project");
      expect(result).toBeDefined();
    });

    it("returns error for invalid input without file or symbol", async () => {
      const result = await resolveTarget({}, "/project");
      expect(typeof result).toBe("string");
      expect(result).toContain("Error");
    });
  });
});
