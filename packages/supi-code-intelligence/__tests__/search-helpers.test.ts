import { describe, expect, it } from "vitest";
import { escapeRegex, isLowSignalPath, normalizePath } from "../src/search-helpers.ts";

// biome-ignore lint/security/noSecrets: function name in test describe
describe("isLowSignalPath", () => {
  it("detects node_modules", () => {
    expect(isLowSignalPath("node_modules/pkg/index.js")).toBe(true);
  });

  it("detects .git", () => {
    expect(isLowSignalPath(".git/objects/abc")).toBe(true);
  });

  it("detects dist", () => {
    expect(isLowSignalPath("packages/core/dist/index.js")).toBe(true);
  });

  it("detects build", () => {
    expect(isLowSignalPath("build/output.js")).toBe(true);
  });

  it("detects coverage", () => {
    expect(isLowSignalPath("coverage/lcov-report/index.html")).toBe(true);
  });

  it("passes normal source paths", () => {
    expect(isLowSignalPath("packages/core/src/index.ts")).toBe(false);
  });

  it("passes root-level files", () => {
    expect(isLowSignalPath("index.ts")).toBe(false);
  });
});

describe("escapeRegex", () => {
  it("escapes special regex characters", () => {
    expect(escapeRegex("foo.bar")).toBe("foo\\.bar");
    expect(escapeRegex("a+b*c")).toBe("a\\+b\\*c");
    expect(escapeRegex("test(1)")).toBe("test\\(1\\)");
  });

  it("leaves alphanumeric strings unchanged", () => {
    expect(escapeRegex("fooBar123")).toBe("fooBar123");
  });
});

describe("normalizePath", () => {
  it("strips leading @", () => {
    const result = normalizePath("@packages/core", "/project");
    expect(result).not.toContain("@");
    expect(result).toContain("packages/core");
  });
});
