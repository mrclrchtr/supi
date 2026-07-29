import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  normalizePath,
  resolveScope,
  resolveScopeSet,
} from "../../../../src/analysis/search/paths.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "search-paths-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("search scope paths", () => {
  it("normalizes PI @ paths and file URIs", () => {
    expect(normalizePath("@packages/core", "/project")).toBe("/project/packages/core");
  });

  it("resolves omitted, directory, and file scopes", () => {
    mkdirSync(path.join(tmpDir, "src"));
    writeFileSync(path.join(tmpDir, "index.ts"), "export const x = 1;\n");

    expect(resolveScope(undefined, tmpDir)).toEqual({ kind: "ok", path: tmpDir });
    expect(resolveScope("src", tmpDir)).toEqual({ kind: "ok", path: path.join(tmpDir, "src") });
    expect(resolveScope("index.ts", tmpDir)).toEqual({
      kind: "ok",
      path: path.join(tmpDir, "index.ts"),
    });
  });

  it("rejects missing or delimiter-separated single scopes", () => {
    expect(resolveScope("missing", tmpDir)).toMatchObject({ kind: "error" });
    expect(resolveScope("src README.md", tmpDir)).toMatchObject({ kind: "error" });
    expect(resolveScope("src,README.md", tmpDir)).toMatchObject({ kind: "error" });
  });

  it("resolves and deduplicates an explicit Scope set", () => {
    mkdirSync(path.join(tmpDir, "src"));

    expect(resolveScopeSet(["src", "@src"], tmpDir)).toEqual({
      kind: "ok",
      paths: [path.join(tmpDir, "src")],
      display: "src",
    });
  });
});
