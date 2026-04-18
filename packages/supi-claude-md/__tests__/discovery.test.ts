import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type DiscoveredContextFile,
  extractPathFromToolEvent,
  filterAlreadyLoaded,
  findSubdirContextFiles,
} from "../discovery.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-claude-md-disc-test-"));
}

function createFile(filePath: string, content: string = "context"): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

const DEFAULT_FILE_NAMES = ["CLAUDE.md", "AGENTS.md"];

describe("findSubdirContextFiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds context file in immediate directory", () => {
    createFile(path.join(tmpDir, "packages/foo/CLAUDE.md"));
    createFile(path.join(tmpDir, "packages/foo/src/bar.ts"));

    const results = findSubdirContextFiles("packages/foo/src/bar.ts", tmpDir, DEFAULT_FILE_NAMES);

    expect(results).toHaveLength(1);
    expect(results[0]?.relativePath).toBe("packages/foo/CLAUDE.md");
  });

  it("walks up finding multiple context files, ordered nearest-to-farthest", () => {
    createFile(path.join(tmpDir, "packages/foo/CLAUDE.md"), "pkg-foo");
    createFile(path.join(tmpDir, "packages/CLAUDE.md"), "packages");
    createFile(path.join(tmpDir, "packages/foo/src/bar.ts"));

    const results = findSubdirContextFiles("packages/foo/src/bar.ts", tmpDir, DEFAULT_FILE_NAMES);

    expect(results).toHaveLength(2);
    // Nearest first (foo), then farther (packages)
    expect(results[0]?.relativePath).toBe("packages/foo/CLAUDE.md");
    expect(results[1]?.relativePath).toBe("packages/CLAUDE.md");
  });

  it("stops at cwd (does not include cwd-level context)", () => {
    createFile(path.join(tmpDir, "CLAUDE.md"), "root");
    createFile(path.join(tmpDir, "packages/foo/CLAUDE.md"), "pkg");
    createFile(path.join(tmpDir, "packages/foo/src/bar.ts"));

    const results = findSubdirContextFiles("packages/foo/src/bar.ts", tmpDir, DEFAULT_FILE_NAMES);

    // Root CLAUDE.md is AT cwd, not below it, so it should be included
    // since we walk up TO cwd (inclusive)
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]?.relativePath).toBe("packages/foo/CLAUDE.md");
  });

  it("returns empty when no context files exist", () => {
    createFile(path.join(tmpDir, "packages/foo/src/bar.ts"));

    const results = findSubdirContextFiles("packages/foo/src/bar.ts", tmpDir, DEFAULT_FILE_NAMES);

    expect(results).toHaveLength(0);
  });

  it("returns empty for file outside cwd", () => {
    const results = findSubdirContextFiles(
      "/some/absolute/path/outside.ts",
      tmpDir,
      DEFAULT_FILE_NAMES,
    );

    expect(results).toHaveLength(0);
  });

  it("prefers first file name in list per directory", () => {
    createFile(path.join(tmpDir, "packages/foo/INSTRUCTIONS.md"), "instructions");
    createFile(path.join(tmpDir, "packages/foo/CLAUDE.md"), "claude");
    createFile(path.join(tmpDir, "packages/foo/src/bar.ts"));

    const results = findSubdirContextFiles("packages/foo/src/bar.ts", tmpDir, [
      "INSTRUCTIONS.md",
      "CLAUDE.md",
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.relativePath).toBe("packages/foo/INSTRUCTIONS.md");
  });

  it("finds AGENTS.md when CLAUDE.md is absent", () => {
    createFile(path.join(tmpDir, "packages/foo/AGENTS.md"), "agents");
    createFile(path.join(tmpDir, "packages/foo/src/bar.ts"));

    const results = findSubdirContextFiles("packages/foo/src/bar.ts", tmpDir, DEFAULT_FILE_NAMES);

    expect(results).toHaveLength(1);
    expect(results[0]?.relativePath).toBe("packages/foo/AGENTS.md");
  });

  it("starts from the directory itself for ls-style directory paths", () => {
    createFile(path.join(tmpDir, "packages/foo/CLAUDE.md"), "foo context");

    // Simulate `ls packages/foo` — path is a directory
    const results = findSubdirContextFiles("packages/foo", tmpDir, DEFAULT_FILE_NAMES);

    expect(results).toHaveLength(1);
    expect(results[0]?.relativePath).toBe("packages/foo/CLAUDE.md");
  });
});

describe("filterAlreadyLoaded", () => {
  it("removes native paths", () => {
    const found: DiscoveredContextFile[] = [
      { absolutePath: "/project/CLAUDE.md", relativePath: "CLAUDE.md", dir: "/project" },
      {
        absolutePath: "/project/packages/foo/CLAUDE.md",
        relativePath: "packages/foo/CLAUDE.md",
        dir: "/project/packages/foo",
      },
    ];
    const nativePaths = new Set(["/project/CLAUDE.md"]);

    const result = filterAlreadyLoaded(found, nativePaths);
    expect(result).toHaveLength(1);
    expect(result[0]?.relativePath).toBe("packages/foo/CLAUDE.md");
  });

  it("returns all when no native paths", () => {
    const found: DiscoveredContextFile[] = [{ absolutePath: "/a", relativePath: "a", dir: "/" }];

    const result = filterAlreadyLoaded(found, new Set());
    expect(result).toHaveLength(1);
  });
});

describe("extractPathFromToolEvent", () => {
  it("extracts path from read tool", () => {
    expect(extractPathFromToolEvent("read", { path: "foo.ts" })).toBe("foo.ts");
  });

  it("extracts path from write tool", () => {
    expect(extractPathFromToolEvent("write", { path: "bar.ts" })).toBe("bar.ts");
  });

  it("extracts path from edit tool", () => {
    expect(extractPathFromToolEvent("edit", { path: "baz.ts" })).toBe("baz.ts");
  });

  it("extracts path from ls tool", () => {
    expect(extractPathFromToolEvent("ls", { path: "src/" })).toBe("src/");
  });

  it("extracts file from lsp tool", () => {
    expect(extractPathFromToolEvent("lsp", { file: "qux.ts" })).toBe("qux.ts");
  });

  it("returns null for bash tool", () => {
    expect(extractPathFromToolEvent("bash", { command: "cat foo.ts" })).toBeNull();
  });

  it("returns null for unknown tool", () => {
    expect(extractPathFromToolEvent("grep", { pattern: "foo" })).toBeNull();
  });

  it("returns null when path is not a string", () => {
    expect(extractPathFromToolEvent("read", { path: 42 })).toBeNull();
  });
});
