import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DiscoveredContextFile } from "../discovery.ts";
import type { InjectedDir } from "../state.ts";
import { formatSubdirContext, shouldInjectSubdir } from "../subdirectory.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-claude-md-subdir-test-"));
}

// biome-ignore lint/security/noSecrets: describe block name, not a secret
describe("shouldInjectSubdir", () => {
  it("returns true for never-injected directory", () => {
    expect(shouldInjectSubdir("packages/foo", new Map(), 1, 3)).toBe(true);
  });

  it("returns false when within interval", () => {
    const injectedDirs = new Map<string, InjectedDir>([
      ["packages/foo", { turn: 2, file: "packages/foo/CLAUDE.md" }],
    ]);

    expect(shouldInjectSubdir("packages/foo", injectedDirs, 4, 3)).toBe(false);
  });

  it("returns true when interval exceeded", () => {
    const injectedDirs = new Map<string, InjectedDir>([
      ["packages/foo", { turn: 2, file: "packages/foo/CLAUDE.md" }],
    ]);

    // turn delta: 5 - 2 = 3 >= 3
    expect(shouldInjectSubdir("packages/foo", injectedDirs, 5, 3)).toBe(true);
  });

  it("returns false when interval is 0 (disabled) but dir was already injected", () => {
    const injectedDirs = new Map<string, InjectedDir>([
      ["packages/foo", { turn: 2, file: "packages/foo/CLAUDE.md" }],
    ]);

    expect(shouldInjectSubdir("packages/foo", injectedDirs, 5, 0)).toBe(false);
  });

  it("returns true for never-injected dir even when interval is 0", () => {
    expect(shouldInjectSubdir("packages/foo", new Map(), 5, 0)).toBe(true);
  });

  it("returns true at exact boundary", () => {
    const injectedDirs = new Map<string, InjectedDir>([
      ["packages/foo", { turn: 3, file: "packages/foo/CLAUDE.md" }],
    ]);

    // turn delta: 6 - 3 = 3 >= 3
    expect(shouldInjectSubdir("packages/foo", injectedDirs, 6, 3)).toBe(true);
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

    const result = formatSubdirContext(files, 5);

    expect(result).toContain(
      '<extension-context source="supi-claude-md" file="packages/foo/CLAUDE.md" turn="5">',
    );
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

    const result = formatSubdirContext(files, 3);

    expect(result).toContain("Context A");
    expect(result).toContain("Context B");
    expect(result).toContain('turn="3"');
  });

  it("skips files that cannot be read", () => {
    const files: DiscoveredContextFile[] = [
      {
        absolutePath: "/nonexistent/path/CLAUDE.md",
        relativePath: "missing/CLAUDE.md",
        dir: "/nonexistent/path",
      },
    ];

    const result = formatSubdirContext(files, 1);
    expect(result).toBe("");
  });

  it("skips empty files", () => {
    const filePath = path.join(tmpDir, "empty.md");
    fs.writeFileSync(filePath, "   \n  \n");

    const files: DiscoveredContextFile[] = [
      { absolutePath: filePath, relativePath: "empty/CLAUDE.md", dir: tmpDir },
    ];

    const result = formatSubdirContext(files, 1);
    expect(result).toBe("");
  });
});
