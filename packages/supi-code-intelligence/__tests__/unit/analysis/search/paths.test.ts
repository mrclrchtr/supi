import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  normalizePath,
  resolveScope,
  resolveScopeSet,
  toDisplayPath,
} from "../../../../src/analysis/search/paths.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "search-paths-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("source path display", () => {
  it("preserves virtual provider URIs instead of fabricating filesystem locations", () => {
    expect(toDisplayPath(tmpDir, "jdt://contents/library/example.class")).toBe(
      "jdt://contents/library/example.class",
    );
  });
  it("renders external source aliases and file URIs as one canonical absolute path", () => {
    const root = realpathSync(tmpDir);
    const cwd = path.join(root, "workspace");
    mkdirSync(cwd);
    const external = path.join(root, "external source.ts");
    writeFileSync(external, "export const value = 1;\n");
    const alias = path.join(root, "source-link.ts");
    symlinkSync(external, alias);

    for (const file of [external, alias, "../source-link.ts", pathToFileURL(alias).href]) {
      expect(toDisplayPath(cwd, file)).toBe(external);
    }
  });

  it("keeps canonical workspace files relative through workspace and file aliases", () => {
    const root = realpathSync(tmpDir);
    const cwd = path.join(root, "workspace");
    mkdirSync(path.join(cwd, "src"), { recursive: true });
    const file = path.join(cwd, "src", "value.ts");
    writeFileSync(file, "export const value = 1;\n");
    const workspaceAlias = path.join(root, "workspace-link");
    symlinkSync(cwd, workspaceAlias, "dir");
    const fileAlias = path.join(cwd, "value-link.ts");
    symlinkSync(file, fileAlias);

    for (const input of [file, fileAlias, path.join(workspaceAlias, "src", "value.ts")]) {
      expect(toDisplayPath(workspaceAlias, input)).toBe("src/value.ts");
    }
  });

  it("preserves containment for missing files without mistaking sibling names for the workspace", () => {
    const root = realpathSync(tmpDir);
    const cwd = path.join(root, "workspace");
    mkdirSync(cwd);
    const alias = path.join(root, "workspace-link");
    symlinkSync(cwd, alias, "dir");

    expect(toDisplayPath(alias, path.join(alias, "src", "missing.ts"))).toBe("src/missing.ts");
    expect(toDisplayPath(cwd, "../workspace-other/missing.ts")).toBe(
      path.join(root, "workspace-other", "missing.ts"),
    );
    expect(toDisplayPath(cwd, "src/missing.ts")).toBe("src/missing.ts");
  });
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
