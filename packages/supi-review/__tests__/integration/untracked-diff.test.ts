import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diffUntrackedFiles } from "../../src/target/diff.ts";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Reference: the per-file `/dev/null` patch Review used before batching. */
function perFilePatch(cwd: string, path: string): Buffer {
  try {
    return execFileSync(
      "git",
      [
        "--literal-pathspecs",
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--binary",
        "--no-index",
        "--",
        "/dev/null",
        path,
      ],
      { cwd, stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch (error) {
    return (error as { stdout: Buffer }).stdout;
  }
}

function objectFiles(cwd: string): string[] {
  return readdirSync(join(cwd, ".git", "objects"), { recursive: true })
    .map(String)
    .sort();
}

let cwd: string;
let home: string;

beforeEach(() => {
  // Review strips GIT_* variables, so pin the global config through an empty HOME instead. The
  // developer's settings (for example core.autocrlf) must not differ between the oracle and Review.
  home = mkdtempSync(join(tmpdir(), "supi-review-home-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("XDG_CONFIG_HOME", join(home, ".config"));
  cwd = mkdtempSync(join(tmpdir(), "supi-review-untracked-"));
  git(cwd, "init");
  git(cwd, "config", "user.email", "test@example.com");
  git(cwd, "config", "user.name", "Test");
  git(cwd, "config", "commit.gpgsign", "false");
  writeFileSync(join(cwd, "tracked.txt"), "base\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", "base");
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("diffUntrackedFiles", () => {
  it("matches the per-file patches byte for byte without writing repository objects", async () => {
    writeFileSync(join(cwd, "tracked.txt"), "changed\n");
    writeFileSync(join(cwd, "text.txt"), "hello\n");
    writeFileSync(join(cwd, "no-newline.txt"), "tail");
    writeFileSync(join(cwd, "crlf.txt"), "a\r\nb\r\n");
    writeFileSync(join(cwd, "empty.txt"), "");
    writeFileSync(join(cwd, "binary.bin"), Buffer.from([0, 1, 2, 255]));
    writeFileSync(join(cwd, "run.sh"), "#!/bin/sh\n");
    chmodSync(join(cwd, "run.sh"), 0o755);
    symlinkSync("text.txt", join(cwd, "link"));
    writeFileSync(join(cwd, "ü space.txt"), "unicode\n");
    writeFileSync(join(cwd, "*"), "pathspec magic\n");
    writeFileSync(join(cwd, ":(top)x"), "pathspec magic\n");
    writeFileSync(join(cwd, ".gitattributes"), "*.dat binary\n*.up filter=upper\n");
    git(cwd, "config", "filter.upper.clean", "tr a-z A-Z");
    writeFileSync(join(cwd, "data.dat"), "abc\n");
    writeFileSync(join(cwd, "filtered.up"), "lower\n");
    const paths = git(cwd, "ls-files", "--others", "--exclude-standard", "-z")
      .split("\0")
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
    const objectsBefore = objectFiles(cwd);

    const patches = await diffUntrackedFiles(cwd, paths);

    expect([...patches.keys()]).toEqual(paths);
    for (const path of paths) {
      expect(patches.get(path)?.toString("latin1"), path).toBe(
        perFilePatch(cwd, path).toString("latin1"),
      );
    }
    expect(objectFiles(cwd)).toEqual(objectsBefore);
  });

  it("keeps plain headers and executable modes under color and core.fileMode=false config", async () => {
    git(cwd, "config", "color.ui", "always");
    git(cwd, "config", "core.fileMode", "false");
    writeFileSync(join(cwd, "run.sh"), "#!/bin/sh\n");
    chmodSync(join(cwd, "run.sh"), 0o755);

    const patch = (await diffUntrackedFiles(cwd, ["run.sh"])).get("run.sh")?.toString();

    expect(patch).toMatch(/^diff --git a\/run\.sh b\/run\.sh\nnew file mode 100755\n/);
  });

  it("writes no objects to the repository from a linked worktree", async () => {
    const linked = join(cwd, "..", `${cwd.split("/").pop()}-linked`);
    git(cwd, "worktree", "add", "--detach", linked);
    try {
      writeFileSync(join(linked, "new.txt"), "new\n");
      const objectsBefore = objectFiles(cwd);

      const patches = await diffUntrackedFiles(linked, ["new.txt"]);

      expect(patches.get("new.txt")?.toString()).toBe(perFilePatch(linked, "new.txt").toString());
      expect(objectFiles(cwd)).toEqual(objectsBefore);
    } finally {
      git(cwd, "worktree", "remove", "--force", linked);
    }
  });

  it("returns an empty patch for nested repositories, as the per-file diff did", async () => {
    const nested = join(cwd, "nested");
    mkdirSync(nested);
    git(nested, "init");
    writeFileSync(join(nested, "inner.txt"), "inner\n");
    writeFileSync(join(cwd, "next.txt"), "next\n");

    const patches = await diffUntrackedFiles(cwd, ["nested/", "next.txt"]);

    expect(patches.get("nested/")).toEqual(Buffer.alloc(0));
    expect(patches.get("next.txt")?.toString()).toBe(perFilePatch(cwd, "next.txt").toString());
  });

  it("includes untracked files outside a sparse-checkout definition", async () => {
    mkdirSync(join(cwd, "in"));
    mkdirSync(join(cwd, "out"));
    writeFileSync(join(cwd, "in", "a.txt"), "a\n");
    writeFileSync(join(cwd, "out", "b.txt"), "b\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-m", "dirs");
    git(cwd, "sparse-checkout", "set", "in");
    mkdirSync(join(cwd, "out"), { recursive: true });
    writeFileSync(join(cwd, "out", "new.txt"), "new\n");

    const patches = await diffUntrackedFiles(cwd, ["out/new.txt"]);

    expect(patches.get("out/new.txt")?.toString()).toBe(
      perFilePatch(cwd, "out/new.txt").toString(),
    );
  });
});
