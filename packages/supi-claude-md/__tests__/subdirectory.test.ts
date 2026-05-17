import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DiscoveredContextFile } from "../src/discovery.ts";
import { formatSubdirContext, shouldInjectSubdir } from "../src/subdirectory.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-claude-md-subdir-test-"));
}

// biome-ignore lint/security/noSecrets: describe block name, not a secret
describe("shouldInjectSubdir", () => {
  it("returns true for never-injected directory", () => {
    const injectedDirs = new Set<string>();
    expect(shouldInjectSubdir("packages/foo", injectedDirs)).toBe(true);
  });

  it("returns false for already-injected directory", () => {
    const injectedDirs = new Set<string>(["packages/foo"]);
    expect(shouldInjectSubdir("packages/foo", injectedDirs)).toBe(false);
  });

  it("returns true for uninjected directory when others have been injected", () => {
    const injectedDirs = new Set<string>(["packages/bar"]);
    expect(shouldInjectSubdir("packages/foo", injectedDirs)).toBe(true);
  });
});

describe("formatSubdirContext", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("formats a single context file", () => {
    const filePath = path.join(tmpDir, "CLAUDE.md");
    fs.writeFileSync(filePath, "This is context for this package.");

    const files: DiscoveredContextFile[] = [
      { absolutePath: filePath, relativePath: "packages/foo/CLAUDE.md", dir: tmpDir },
    ];

    const result = formatSubdirContext(files);

    expect(result).toContain(
      '<extension-context source="supi-claude-md" file="packages/foo/CLAUDE.md"',
    );
    expect(result).not.toContain("turn=");
    expect(result).toContain("This is context for this package.");
    expect(result).toContain("</extension-context>");
  });

  it("formats multiple context files separated by blank lines", () => {
    const file1 = path.join(tmpDir, "a.md");
    const file2 = path.join(tmpDir, "b.md");
    fs.writeFileSync(file1, "Context A");
    fs.writeFileSync(file2, "Context B");

    const files: DiscoveredContextFile[] = [
      { absolutePath: file1, relativePath: "a/CLAUDE.md", dir: tmpDir },
      { absolutePath: file2, relativePath: "b/CLAUDE.md", dir: tmpDir },
    ];

    const result = formatSubdirContext(files);

    expect(result).toContain("Context A");
    expect(result).toContain("Context B");
  });

  it("skips files that cannot be read", () => {
    const files: DiscoveredContextFile[] = [
      {
        absolutePath: "/nonexistent/path/CLAUDE.md",
        relativePath: "missing/CLAUDE.md",
        dir: "/nonexistent/path",
      },
    ];

    const result = formatSubdirContext(files);
    expect(result).toBe("");
  });

  it("skips empty files", () => {
    const filePath = path.join(tmpDir, "empty.md");
    fs.writeFileSync(filePath, "   \n  \n");

    const files: DiscoveredContextFile[] = [
      { absolutePath: filePath, relativePath: "empty/CLAUDE.md", dir: tmpDir },
    ];

    const result = formatSubdirContext(files);
    expect(result).toBe("");
  });
});
