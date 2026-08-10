import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalReviewAuditStore } from "../../src/audit/local-review-audit-store.ts";
import { ReviewArtifactStore } from "../../src/session/review-artifact-store.ts";
import { runReviewCommand } from "../../src/tui/review-command.ts";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

type ReviewCommandContext = Parameters<typeof runReviewCommand>[0];

function scriptedContext(cwd: string, selects: string[]) {
  const select = vi.fn(async (_title: string, choices: string[]) => {
    const value = selects.shift();
    if (value === undefined) return undefined;
    if (!choices.includes(value)) throw new Error(`Scripted choice ${value} is not available.`);
    return value;
  });
  const notify = vi.fn();
  const base = makeCtx();
  const ctx = makeCtx({
    cwd,
    hasUI: true,
    ui: { ...base.ui, notify, select },
  });
  return { ctx: ctx as unknown as ReviewCommandContext, notify, select };
}

async function runCommand(ctx: ReviewCommandContext, cwd: string) {
  const pi = createPiMock();
  await runReviewCommand(ctx, {
    pi: pi as never,
    artifactStore: new ReviewArtifactStore(),
    auditStore: new LocalReviewAuditStore({ agentDir: join(cwd, ".agent") }),
  });
  return pi;
}

function initializeRepository(cwd: string): string {
  git(cwd, "init");
  git(cwd, "config", "user.email", "test@example.com");
  git(cwd, "config", "user.name", "Test");
  git(cwd, "config", "commit.gpgsign", "false");
  git(cwd, "config", "tag.gpgSign", "false");
  git(cwd, "config", "core.hooksPath", "/dev/null");
  writeFileSync(join(cwd, "tracked.txt"), "main\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", "main");
  return git(cwd, "branch", "--show-current");
}

describe("/supi-review target picker Git errors", () => {
  const directories: string[] = [];

  afterEach(() => {
    while (directories.length > 0)
      rmSync(directories.pop() as string, { recursive: true, force: true });
  });

  it.each([
    "Current work",
    "Current work against a base branch",
    "Committed work against a base branch",
    "One commit",
  ])("stops %s before further selection in an unborn repository", async (target) => {
    const cwd = mkdtempSync(join(tmpdir(), "supi-review-command-unborn-"));
    directories.push(cwd);
    git(cwd, "init");
    const command = scriptedContext(cwd, [target]);

    const pi = await runCommand(command.ctx, cwd);

    expect(command.notify).toHaveBeenCalledWith(
      "No HEAD commit found in this repository.",
      "error",
    );
    expect(command.select).toHaveBeenCalledTimes(1);
    expect(pi.messages).toHaveLength(0);
  });

  it("stops One commit when a shallow clone lacks the first parent", async () => {
    const source = mkdtempSync(join(tmpdir(), "supi-review-command-shallow-source-"));
    const clone = mkdtempSync(join(tmpdir(), "supi-review-command-shallow-clone-"));
    directories.push(source, clone);
    initializeRepository(source);
    writeFileSync(join(source, "tracked.txt"), "tip\n");
    git(source, "commit", "-am", "tip");
    execFileSync("git", ["clone", "--depth=1", pathToFileURL(source).href, clone], {
      encoding: "utf8",
    });
    const tip = git(clone, "rev-parse", "HEAD");
    const command = scriptedContext(clone, ["One commit", `${tip.slice(0, 7)}  tip`]);

    const pi = await runCommand(command.ctx, clone);

    expect(command.notify).toHaveBeenCalledWith(
      "The selected commit's first parent is unavailable. Fetch it before a one-commit Review.",
      "error",
    );
    expect(command.select).toHaveBeenCalledTimes(2);
    expect(pi.messages).toHaveLength(0);
  });

  it("reports a base branch with no common ancestor", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "supi-review-command-unrelated-"));
    directories.push(cwd);
    const main = initializeRepository(cwd);
    git(cwd, "checkout", "--orphan", "unrelated");
    git(cwd, "rm", "-rf", ".");
    writeFileSync(join(cwd, "unrelated.txt"), "unrelated\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-m", "unrelated");
    git(cwd, "checkout", main);
    const command = scriptedContext(cwd, ["Current work against a base branch", "unrelated"]);

    const pi = await runCommand(command.ctx, cwd);

    expect(command.notify).toHaveBeenCalledWith(
      "The selected branch has no common ancestor with HEAD.",
      "error",
    );
    expect(command.select).toHaveBeenCalledTimes(2);
    expect(pi.messages).toHaveLength(0);
  });
});
