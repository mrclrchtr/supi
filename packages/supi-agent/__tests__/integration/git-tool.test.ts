import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerGitTool } from "../../src/tool/git/register.ts";

let repo: string;

function git(...args: string[]): void {
  execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "supi-agent-git-"));
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  await writeFile(join(repo, "a.txt"), "one\n");
  git("add", "a.txt");
  git("commit", "-q", "--no-verify", "-m", "initial");
  await writeFile(join(repo, "a.txt"), "one\ntwo\n");
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

async function runGitTool(args: string[]) {
  const pi = createPiMock();
  registerGitTool(pi as never);
  const tool = getTool(pi, "git");
  return (await tool.execute("call", { args }, undefined, undefined, makeCtx({ cwd: repo }))) as {
    content: { type: string; text: string }[];
    details: { truncated: boolean };
  };
}

describe("git tool", () => {
  it("returns read-only query output from the run's working directory", async () => {
    const result = await runGitTool(["diff"]);
    expect(result.content[0]?.text).toContain("+two");
    expect(result.details.truncated).toBe(false);
  });

  it("does not run a repository-configured external diff driver", async () => {
    const marker = join(repo, "driver-ran");
    git("config", "diff.external", `sh -c 'touch ${marker}'`);
    const result = await runGitTool(["diff"]);
    expect(existsSync(marker)).toBe(false);
    expect(result.content[0]?.text).toContain("+two");
  });

  it.each([
    [["commit", "-m", "x"]],
    [["stash"]],
    [["-c", "diff.external=sh", "diff"]],
    [["diff", "--output=out.patch"]],
    [["log", "--outp=out.patch"]],
    [["diff", "--ext-diff"]],
    [["show", "--textconv"]],
    [["status", "-sv"]],
  ])("rejects %j before running Git", async (args) => {
    await expect(runGitTool(args)).rejects.toThrow(/not allowed|must be one of/);
    expect(existsSync(join(repo, "out.patch"))).toBe(false);
  });

  it("passes arguments after -- through as paths", async () => {
    const result = await runGitTool(["log", "--oneline", "--", "--output"]);
    expect(result.content[0]?.text).toMatch(/^\(no output: no commits matched\./);
  });

  it("names the rejected leading token", async () => {
    await expect(runGitTool(["-c", "diff.external=sh", "diff"])).rejects.toThrow(
      'Option "-c" before the subcommand is not allowed',
    );
    await expect(runGitTool(["stash"])).rejects.toThrow('"stash" is not an allowed subcommand');
  });

  it("explains empty output by subcommand", async () => {
    const untracked = await runGitTool(["ls-files", "no-such-dir"]);
    expect(untracked.content[0]?.text).toContain("no tracked files matched");
    const missingPath = await runGitTool(["diff", "HEAD", "--", "no-such-file"]);
    expect(missingPath.content[0]?.text).toContain("paths are not checked for existence");
  });

  it("truncates output past the collection cap instead of failing", async () => {
    await writeFile(join(repo, "big.txt"), `${"x".repeat(99)}\n`.repeat(15_000));
    git("add", "big.txt");
    git("commit", "-q", "--no-verify", "-m", "big");
    const result = await runGitTool(["show", "HEAD:big.txt"]);
    expect(result.details.truncated).toBe(true);
    expect(result.content[0]?.text).toMatch(/\[Output truncated to \d+ lines of more than /);
  });

  it("reports Git failures as tool errors", async () => {
    await expect(runGitTool(["show", "no-such-ref"])).rejects.toThrow(/git show failed/);
  });
});
