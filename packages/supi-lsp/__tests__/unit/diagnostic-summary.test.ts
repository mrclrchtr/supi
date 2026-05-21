import { describe, expect, it } from "vitest";
import { relativeFilePathFromUri } from "../../src/diagnostics/diagnostic-summary.ts";

describe("relativeFilePathFromUri", () => {
  it("decodes percent-encoded paths before relativizing", () => {
    expect(relativeFilePathFromUri("file:///project/src/my%20file.ts", "/project")).toBe(
      "src/my file.ts",
    );
  });

  it("preserves absolute paths for tracked out-of-tree files", () => {
    expect(relativeFilePathFromUri("file:///other/project/file.ts", "/project")).toBe(
      "/other/project/file.ts",
    );
  });
});
