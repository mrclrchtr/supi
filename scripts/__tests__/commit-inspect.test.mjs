import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";

const script = fileURLToPath(new URL("../../skills/commit/scripts/inspect.sh", import.meta.url));
const directories = [];
const realGit = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();

// Isolate Git's version-dependent hook listing while keeping all repository reads real.
function withHookListing(env, response) {
  const bin = mkdtempSync(join(tmpdir(), "commit-inspect-git-"));
  directories.push(bin);
  writeFileSync(
    join(bin, "git"),
    `#!/bin/sh\nif [ "$1" = hook ] && [ "$2" = list ]; then\n${response}\nfi\nexec "$REAL_GIT" "$@"\n`,
    { mode: 0o755 },
  );
  return { ...env, PATH: `${bin}:${env.PATH}`, REAL_GIT: realGit };
}

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "commit-inspect-"));
  directories.push(cwd);
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    LC_ALL: "C",
  };
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Commit inspection test");
  git("config", "user.email", "commit-inspect@example.invalid");
  const inspect = (options = {}) =>
    spawnSync("sh", [script], { cwd, env, encoding: "utf8", ...options });
  return { cwd, env, git, inspect };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

it("reports a mixed candidate without changing files, index, configuration, or HEAD, or running hooks", () => {
  const { cwd, git, inspect } = fixture();
  const tracked = join(cwd, "tracked.txt");
  writeFileSync(tracked, "original\n");
  git("add", "tracked.txt");
  git("commit", "-qm", "docs: initial example");
  writeFileSync(tracked, "staged content\n");
  git("add", "tracked.txt");
  writeFileSync(tracked, "unstaged content\n");
  writeFileSync(join(cwd, "untracked.txt"), "untracked content\n");
  writeFileSync(join(cwd, ".git/hooks/pre-commit"), "#!/bin/sh\ntouch hook-ran\n", { mode: 0o755 });
  const fsmonitor = join(cwd, ".git/hooks/fsmonitor-test");
  writeFileSync(fsmonitor, "#!/bin/sh\ntouch fsmonitor-ran\nprintf 'token\\000'\n", {
    mode: 0o755,
  });
  git("config", "core.fsmonitor", fsmonitor);
  git("config", "core.fsmonitorHookVersion", "2");

  const paths = [".git/index", ".git/config", ".git/HEAD", "tracked.txt", "untracked.txt"];
  const before = paths.map((path) => readFileSync(join(cwd, path)));
  const head = git("rev-parse", "HEAD");
  const result = inspect();

  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("## main");
  expect(result.stdout).toContain("MM tracked.txt");
  expect(result.stdout).toContain("?? untracked.txt");
  expect(result.stdout).toContain("docs: initial example");
  expect(result.stdout).toMatch(
    /Staged[^\n]*\n1\t1\ttracked\.txt\nUnstaged[^\n]*\n1\t1\ttracked\.txt\n/,
  );
  expect(result.stdout).toContain("pre-commit");
  expect(result.stdout).not.toContain("staged content");
  expect(existsSync(join(cwd, "hook-ran"))).toBe(false);
  expect(existsSync(join(cwd, "fsmonitor-ran"))).toBe(false);
  expect(paths.map((path) => readFileSync(join(cwd, path)))).toEqual(before);
  expect(git("rev-parse", "HEAD")).toBe(head);
});

it("reports an unborn branch and missing hooks without treating them as inspection errors", () => {
  const { inspect } = fixture();
  const result = inspect();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("main");
  expect(result.stdout).toContain("none (no commits yet)");
  expect(result.stdout).toMatch(/Staged[^\n]*\nnone\nUnstaged[^\n]*\nnone\n/);
  expect(result.stdout).toContain("pre-commit: absent");
});

it("finds configuration-registered hooks even when the hook directory is disabled", (context) => {
  const { cwd, env, git, inspect } = fixture();
  const probe = spawnSync("git", ["hook", "list", "--show-scope", "pre-commit"], {
    cwd,
    env,
    encoding: "utf8",
  });
  if (probe.status === 129 || probe.stderr.includes("'hook' is not a git command")) {
    context.skip("Git does not support configuration-registered hooks");
  }
  git("config", "core.hooksPath", "/dev/null");
  git("config", "hook.candidate-check.event", "pre-commit");
  git("config", "hook.candidate-check.command", "touch private-command-marker");
  const result = inspect();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toMatch(/^pre-commit: .*candidate-check$/m);
  expect(result.stdout).not.toContain("pre-commit: absent");
  expect(result.stdout).not.toContain("private-command-marker");
  expect(existsSync(join(cwd, "private-command-marker"))).toBe(false);
});

it.each([
  ["legacy hook subcommand", "exit 129"],
  ["Git without the hook command", "printf \"git: 'hook' is not a git command.\\n\" >&2; exit 1"],
])("uses executable hook files from a relative hooksPath with %s", (_, response) => {
  const { cwd, env, git, inspect } = fixture();
  mkdirSync(join(cwd, "custom hooks"));
  mkdirSync(join(cwd, "nested"));
  git("config", "core.hooksPath", "custom hooks");
  writeFileSync(join(cwd, "custom hooks/pre-commit"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  writeFileSync(join(cwd, "custom hooks/commit-msg"), "#!/bin/sh\nexit 0\n", { mode: 0o644 });
  const result = inspect({ cwd: join(cwd, "nested"), env: withHookListing(env, response) });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("unsupported");
  expect(result.stdout).toContain("pre-commit: executable file (custom hooks/pre-commit)");
  expect(result.stdout).toContain("commit-msg: inactive file");
  expect(result.stdout).toContain("post-commit: absent");
});

it("resolves operation markers and shared hook files from a linked worktree", () => {
  const { cwd, env, git, inspect } = fixture();
  git("commit", "--allow-empty", "-qm", "chore: initial example");
  const worktree = mkdtempSync(join(tmpdir(), "commit-inspect-worktree-"));
  directories.push(worktree);
  git("worktree", "add", "-qb", "topic", worktree);
  mkdirSync(git("-C", worktree, "rev-parse", "--git-path", "rebase-merge"));
  writeFileSync(join(cwd, ".git/hooks/pre-commit"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const result = inspect({ cwd: worktree, env: withHookListing(env, "exit 129") });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("## topic");
  expect(result.stdout).toContain("rebase-merge");
  expect(result.stdout).toContain("pre-commit: executable file");
});

it("fails rather than treating a hook inspection error as missing or unsupported hooks", () => {
  const { env, inspect } = fixture();
  const result = inspect({
    env: withHookListing(env, "printf 'fatal: cannot read hook configuration\\n' >&2; exit 128"),
  });
  expect(result.status).toBe(128);
  expect(result.stderr).toContain("Hook inspection failed");
  expect(result.stderr).toContain("cannot read hook configuration");
  expect(result.stdout).not.toContain("pre-commit: absent");
  expect(result.stdout).not.toContain("unsupported");
});

it("stops when configured hooks cannot be verified by the legacy fallback", () => {
  const { env, git, inspect } = fixture();
  git("config", "hook.candidate-check.event", "pre-commit");
  git("config", "hook.candidate-check.command", "true");
  const result = inspect({ env: withHookListing(env, "exit 129") });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("configured events cannot be verified");
  expect(result.stdout).not.toContain("pre-commit: absent");
});

it("rejects a directory outside a Git working tree", () => {
  const { inspect } = fixture();
  const outside = mkdtempSync(join(tmpdir(), "commit-inspect-outside-"));
  directories.push(outside);
  const result = inspect({ cwd: outside });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("not a git repository");
});
