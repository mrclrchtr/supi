import { describe, expect, it } from "vitest";
import { isGlobMatch } from "../src/pattern-matcher.ts";

describe("isGlobMatch", () => {
  // Literal directory names at any depth
  it("matches file inside __tests__ directory", () => {
    expect(isGlobMatch("src/__tests__/app.test.ts", "__tests__")).toBe(true);
  });

  it("matches file at root in __tests__ directory", () => {
    expect(isGlobMatch("__tests__/app.test.ts", "__tests__")).toBe(true);
  });

  it("does not match unrelated paths", () => {
    expect(isGlobMatch("src/app.ts", "__tests__")).toBe(false);
  });

  // Trailing slash = directory-only
  it("trailing slash matches file inside directory", () => {
    expect(isGlobMatch("src/__tests__/app.test.ts", "__tests__/")).toBe(true);
  });

  it("trailing slash does not match file named same as directory", () => {
    expect(isGlobMatch("src/__tests__", "__tests__/")).toBe(false);
  });

  // Extension globs
  it("matches *.generated.ts files", () => {
    expect(isGlobMatch("src/types.generated.ts", "*.generated.ts")).toBe(true);
  });

  it("does not match non-matching files", () => {
    expect(isGlobMatch("src/types.ts", "*.generated.ts")).toBe(false);
  });

  // Leading slash = anchored to root
  it("anchored pattern matches at root", () => {
    expect(isGlobMatch("build/output.js", "/build")).toBe(true);
  });

  it("anchored pattern does not match nested", () => {
    expect(isGlobMatch("src/build/output.js", "/build")).toBe(false);
  });

  // Recursive glob
  it("**/ matches at any depth", () => {
    expect(isGlobMatch("a/b/c/fixtures/data.json", "**/fixtures")).toBe(true);
  });

  // Empty patterns
  it("empty string pattern returns false", () => {
    expect(isGlobMatch("src/app.ts", "")).toBe(false);
  });

  // Multiple `*` wildcards
  it("matches **/fixtures/** pattern", () => {
    expect(isGlobMatch("a/b/c/fixtures/deep/file.ts", "**/fixtures/**")).toBe(true);
  });

  // No match for explicit non-matching
  it("does not match when segments differ", () => {
    expect(isGlobMatch("src/components/Button.tsx", "generated/")).toBe(false);
  });
});
