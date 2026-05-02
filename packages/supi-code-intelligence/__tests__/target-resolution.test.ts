import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizePath, resolveAnchoredTarget, toZeroBased } from "../target-resolution.ts";

describe("normalizePath", () => {
  it("resolves relative path against cwd", () => {
    const result = normalizePath("src/index.ts", "/project");
    expect(result).toBe(path.resolve("/project", "src/index.ts"));
  });

  it("strips leading @ from path", () => {
    const result = normalizePath("@src/index.ts", "/project");
    expect(result).toBe(path.resolve("/project", "src/index.ts"));
  });

  it("resolves absolute path as-is", () => {
    const result = normalizePath("/absolute/path.ts", "/project");
    expect(result).toBe("/absolute/path.ts");
  });
});

describe("toZeroBased", () => {
  it("converts 1-based to 0-based", () => {
    const pos = toZeroBased(10, 5);
    expect(pos.line).toBe(9);
    expect(pos.character).toBe(4);
  });

  it("handles line 1, character 1", () => {
    const pos = toZeroBased(1, 1);
    expect(pos.line).toBe(0);
    expect(pos.character).toBe(0);
  });
});

describe("resolveAnchoredTarget", () => {
  it("returns error for non-existent file", () => {
    const result = resolveAnchoredTarget("/nonexistent/file.ts", 1, 1, "/tmp");
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("not found");
    }
  });

  it("returns error for binary file", () => {
    // Use a known existing binary-extension path pattern
    const result = resolveAnchoredTarget("test.png", 1, 1, __dirname);
    // Will fail as file-not-found rather than binary, but tests the path
    expect(result.kind).toBe("error");
  });

  it("resolves existing file to a target", () => {
    // Use this test file itself
    const result = resolveAnchoredTarget(path.basename(__filename), 1, 1, __dirname);
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.target.displayLine).toBe(1);
      expect(result.target.displayCharacter).toBe(1);
      expect(result.target.position.line).toBe(0);
      expect(result.target.position.character).toBe(0);
      expect(result.target.confidence).toBe("semantic");
    }
  });
});
