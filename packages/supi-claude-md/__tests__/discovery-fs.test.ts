import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findSubdirContextFiles } from "../discovery.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-claude-md-fs-test-"));
}

function createFile(filePath: string, content: string = "context"): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

describe("findSubdirContextFiles — filesystem integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("handles deep monorepo structure", () => {
    // Simulate: packages/supi-lsp/src/utils/helpers.ts
    // Context at: packages/supi-lsp/CLAUDE.md, packages/CLAUDE.md
    createFile(path.join(tmpDir, "packages/supi-lsp/CLAUDE.md"), "lsp context");
    createFile(path.join(tmpDir, "packages/CLAUDE.md"), "packages context");
    createFile(path.join(tmpDir, "packages/supi-lsp/src/utils/helpers.ts"));

    const results = findSubdirContextFiles("packages/supi-lsp/src/utils/helpers.ts", tmpDir, [
      "CLAUDE.md",
      "AGENTS.md",
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]?.relativePath).toBe("packages/supi-lsp/CLAUDE.md");
    expect(results[1]?.relativePath).toBe("packages/CLAUDE.md");
  });

  it("skips directories with no context files", () => {
    createFile(path.join(tmpDir, "packages/foo/CLAUDE.md"), "foo");
    createFile(path.join(tmpDir, "packages/foo/src/deep/file.ts"));

    const results = findSubdirContextFiles("packages/foo/src/deep/file.ts", tmpDir, ["CLAUDE.md"]);

    expect(results).toHaveLength(1);
    expect(results[0]?.relativePath).toBe("packages/foo/CLAUDE.md");
  });

  it("handles file at root of cwd", () => {
    createFile(path.join(tmpDir, "packages/foo/bar.ts"));

    const results = findSubdirContextFiles("packages/foo/bar.ts", tmpDir, ["CLAUDE.md"]);

    expect(results).toHaveLength(0);
  });
});
