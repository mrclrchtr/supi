import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const publishScript = fileURLToPath(new URL("../../publish-released.mjs", import.meta.url));
const validationScript = fileURLToPath(new URL("../../release-validation.mjs", import.meta.url));

/** Create a real Git checkout with npm replaced by a local recording command. */
export function createReleaseFixture({ version = "6.3.1" } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "supi-release-test-"));
  const bin = join(cwd, "test-bin");
  const log = join(cwd, "npm.jsonl");
  mkdirSync(bin);
  copyFileSync(new URL("../fixtures/release-npm.mjs", import.meta.url), join(bin, "npm"));
  chmodSync(join(bin, "npm"), 0o755);

  function git(args) {
    return execFileSync(
      "git",
      ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args],
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "Release test",
          GIT_AUTHOR_EMAIL: "release@example.test",
          GIT_COMMITTER_NAME: "Release test",
          GIT_COMMITTER_EMAIL: "release@example.test",
        },
      },
    ).trim();
  }

  function writeJson(path, value) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), `${JSON.stringify(value)}\n`);
  }

  function updateJson(path, fields) {
    writeJson(path, { ...JSON.parse(readFileSync(join(cwd, path), "utf8")), ...fields });
  }

  function commit() {
    git(["add", "package.json", ".release-please-manifest.json", "packages"]);
    git(["commit", "-qm", "test: release fixture"]);
    return git(["rev-parse", "HEAD"]);
  }

  git(["init", "-q", "--initial-branch=main"]);
  writeJson("package.json", { name: "release-fixture", version, private: true });
  writeJson(".release-please-manifest.json", { ".": version });
  writeJson("packages/a-app/package.json", {
    name: "@mrclrchtr/test-app",
    version,
    dependencies: { "@mrclrchtr/test-core": "workspace:*" },
  });
  writeJson("packages/z-core/package.json", { name: "@mrclrchtr/test-core", version });
  writeJson("packages/zz-private/package.json", { private: true, version: "0.0.0" });
  const scopeDir = join(cwd, "packages/a-app/node_modules/@mrclrchtr");
  mkdirSync(scopeDir, { recursive: true });
  symlinkSync(join(cwd, "packages/z-core"), join(scopeDir, "test-core"), "dir");
  const sha = commit();
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    RELEASE_SHA: sha,
    RELEASE_VERSION: version,
    TEST_NPM_LOG: log,
    TEST_NPM_EXISTING: "[]",
    TEST_NPM_PUBLISH_FAIL: "false",
  };

  return {
    cwd,
    sha,
    env,
    git,
    writeJson,
    updateJson,
    commit,
    run(overrides = {}, { validateOnly = false } = {}) {
      return spawnSync(process.execPath, [validateOnly ? validationScript : publishScript], {
        cwd,
        env: { ...env, ...overrides },
        encoding: "utf8",
        timeout: 10_000,
      });
    },
    events() {
      if (!existsSync(log)) return [];
      return readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    },
    cleanup() {
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}
