import { spawnSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReleaseFixture } from "./helpers/release-fixture.mjs";

const script = fileURLToPath(new URL("../release-prepare.mjs", import.meta.url));
const gitCliff = fileURLToPath(new URL("../../node_modules/.bin/git-cliff", import.meta.url));

let repo;
beforeEach(() => {
  repo = createReleaseFixture();
  copyFileSync(new URL("../../cliff.toml", import.meta.url), join(repo.cwd, "cliff.toml"));
  repo.updateJson("packages/a-app/package.json", { pi: { extensions: ["./extension.ts"] } });
  writeFileSync(join(repo.cwd, "CHANGELOG.md"), "# Changelog\n\n## 6.3.1\n\n* Previous\n");
  repo.git(["add", "-A"]);
  repo.git(["commit", "-qm", "chore: release 6.3.1"]);
  repo.git(["-c", "tag.gpgsign=false", "tag", "v6.3.1"]);
  syncOrigin();
});

/** Preparation requires main to match origin/main, as after a pull. */
function syncOrigin() {
  repo.git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
}
afterEach(() => {
  repo.cleanup();
});

function change(path, subject) {
  writeFileSync(join(repo.cwd, path), `${subject}\n`);
  repo.git(["add", path]);
  repo.git(["commit", "-qm", subject]);
  syncOrigin();
}

function prepare(...args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repo.cwd,
    env: { ...repo.env, GIT_CLIFF: gitCliff },
    encoding: "utf8",
    timeout: 30_000,
  });
}

const read = (path) => readFileSync(join(repo.cwd, path), "utf8");
const version = (path) => JSON.parse(read(path)).version;

// Each case spawns git-cliff several times (root plus per-package drafts).
describe("release preparation", { timeout: 20_000 }, () => {
  it("bumps lockstep manifests, drafts notes, and leaves committing to the editor", () => {
    change("packages/a-app/feature.txt", "feat(app): add a feature");
    change("packages/z-core/fix.txt", "fix(core): repair a bug");
    change("docs.txt", "docs: unrelated docs");
    const head = repo.git(["rev-parse", "HEAD"]);

    const result = prepare();
    expect(result.status, result.stderr).toBe(0);
    expect(
      ["package.json", "packages/a-app/package.json", "packages/z-core/package.json"].map(version),
    ).toEqual(["6.4.0", "6.4.0", "6.4.0"]);
    expect(version("packages/zz-private/package.json")).toBe("0.0.0");
    const changelog = read("CHANGELOG.md");
    expect(changelog).toMatch(
      /^# Changelog\n\n## \[6\.4\.0\]\(.+\/compare\/v6\.3\.1\.\.\.v6\.4\.0\)/,
    );
    expect(changelog).toContain("* **app:** add a feature");
    expect(changelog).toContain("* **core:** repair a bug");
    expect(changelog).not.toContain("unrelated docs");
    expect(changelog).toContain("## 6.3.1\n\n* Previous");
    // Package drafts only cover public Extension Packages and only their own paths.
    expect(result.stdout).toContain(
      "### packages/a-app\n\n#### Features\n* **app:** add a feature",
    );
    expect(result.stdout).not.toContain("### packages/z-core");
    expect(repo.git(["rev-parse", "HEAD"])).toBe(head);
    expect(repo.git(["tag", "--list", "v6.4.0"])).toBe("");
  });

  it("re-prepares an untagged version without losing edited notes", () => {
    change("packages/a-app/feature.txt", "feat(app): add a feature");
    expect(prepare().status).toBe(0);
    const edited = read("CHANGELOG.md").replace("* **app:** add a feature", "Curated summary.");
    writeFileSync(join(repo.cwd, "CHANGELOG.md"), edited);
    repo.git(["commit", "-qam", "chore: release 6.4.0"]);
    syncOrigin();
    change("packages/a-app/fix.txt", "fix(app): repair verification failure");

    const result = prepare();
    expect(result.status, result.stderr).toBe(0);
    expect(read("CHANGELOG.md")).toBe(edited);
    expect(result.stdout).toContain("Re-prepared 6.4.0");
    const [root, packageDrafts] = result.stdout.split("## Package drafts");
    expect(root).toContain("repair verification failure");
    expect(root).not.toContain("add a feature");
    // Package notes may still be missing, so package drafts cover the whole release.
    expect(packageDrafts).toContain("add a feature");
    expect(packageDrafts).toContain("repair verification failure");
  });

  it.each([
    ["an existing tag", ["--version", "6.3.1"], "already exists"],
    ["an older version", ["--version", "6.3.0"], "must be newer"],
    ["a prerelease", ["--version", "7.0.0-rc.1"], "stable versions only"],
  ])("rejects %s without changing files", (_name, args, message) => {
    change("packages/a-app/feature.txt", "feat(app): add a feature");
    const result = prepare(...args);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
    expect(repo.git(["status", "--porcelain"])).toBe("");
  });

  it("reports nothing to release instead of an existing-tag error", () => {
    change("docs.txt", "docs: only docs");
    const result = prepare();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("No release-relevant commits since v6.3.1");
    expect(repo.git(["status", "--porcelain"])).toBe("");
  });

  it("refuses to stack a new version above a pending untagged section", () => {
    change("packages/a-app/feature.txt", "feat(app): add a feature");
    expect(prepare().status).toBe(0);
    repo.git(["commit", "-qam", "chore: release 6.4.0"]);
    syncOrigin();
    const result = prepare("--version", "7.0.0");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("rename that heading to 7.0.0");
    expect(repo.git(["status", "--porcelain"])).toBe("");
  });

  it("refuses a dirty working tree or a main that differs from origin/main", () => {
    writeFileSync(join(repo.cwd, "dirty.txt"), "x\n");
    expect(prepare().stderr).toContain("clean");
    repo.git(["add", "dirty.txt"]);
    repo.git(["commit", "-qm", "fix: unpushed"]);
    expect(prepare().stderr).toContain("origin/main");
  });
});
