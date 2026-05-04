import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatGitContext, gatherGitContext } from "../src/git-context.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "git-ctx-"));
});

afterEach(() => {
  execFileSync("rm", ["-rf", tmpDir]);
});

function initGit(dir: string) {
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir });
  execFileSync("git", ["config", "core.hooksPath", "/dev/null"], { cwd: dir });
}

function writeFile(dir: string, file: string, content: string) {
  const fullPath = join(dir, file);
  mkdirSync(fullPath.split("/").slice(0, -1).join("/"), { recursive: true });
  writeFileSync(fullPath, content);
}

describe("gatherGitContext", () => {
  it("returns null for non-git directory", () => {
    const ctx = gatherGitContext(tmpDir);
    expect(ctx).toBeNull();
  });

  it("returns branch name and no dirty files for clean repo", () => {
    initGit(tmpDir);
    writeFile(tmpDir, "readme.md", "# Hello");
    execFileSync("git", ["add", "."], { cwd: tmpDir });
    execFileSync("git", ["commit", "-m", "initial"], { cwd: tmpDir });

    const ctx = gatherGitContext(tmpDir);
    expect(ctx).not.toBeNull();
    expect(ctx!.branch).toBe("main");
    expect(ctx!.dirtyFiles).toEqual([]);
    expect(ctx!.lastCommitMessage).toBe("initial");
  });

  it("detects dirty files", () => {
    initGit(tmpDir);
    writeFile(tmpDir, "readme.md", "# Hello");
    execFileSync("git", ["add", "."], { cwd: tmpDir });
    execFileSync("git", ["commit", "-m", "initial"], { cwd: tmpDir });
    writeFile(tmpDir, "new.ts", "export const x = 1;");

    const ctx = gatherGitContext(tmpDir);
    expect(ctx!.dirtyFiles).toEqual(["new.ts"]);
  });
});

describe("formatGitContext", () => {
  it("formats clean repo context", () => {
    const ctx = { branch: "feature/test", dirtyFiles: [], lastCommitMessage: "wip" };
    const formatted = formatGitContext(ctx);
    expect(formatted).toContain("Branch: `feature/test`");
    expect(formatted).toContain("Working tree clean.");
    expect(formatted).toContain("Last commit: `wip`");
  });

  it("formats dirty repo context", () => {
    const ctx = { branch: "main", dirtyFiles: ["a.ts", "b.ts"], lastCommitMessage: null };
    const formatted = formatGitContext(ctx);
    expect(formatted).toContain("Uncommitted: 2 files");
    expect(formatted).toContain("- `a.ts`");
    expect(formatted).toContain("- `b.ts`");
  });
});
