import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
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
import { afterAll } from "vitest";

const publishScript = fileURLToPath(new URL("../../publish-released.mjs", import.meta.url));
const validationScript = fileURLToPath(new URL("../../release-validation.mjs", import.meta.url));

function gitIn(cwd, args) {
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

function writeJsonIn(cwd, path, value) {
  mkdirSync(dirname(join(cwd, path)), { recursive: true });
  writeFileSync(join(cwd, path), `${JSON.stringify(value)}\n`);
}

function commitIn(cwd) {
  gitIn(cwd, ["add", "package.json", "packages"]);
  gitIn(cwd, ["commit", "-qm", "test: release fixture"]);
  return gitIn(cwd, ["rev-parse", "HEAD"]);
}

// Building a checkout takes several Git processes; copying one takes a few milliseconds. Each
// test file builds a template once per key and every test gets its own copy.
const templates = new Map();
afterAll(() => {
  for (const { cwd } of templates.values()) rmSync(cwd, { recursive: true, force: true });
  templates.clear();
});

function buildTemplate(version, extend) {
  const cwd = mkdtempSync(join(tmpdir(), "supi-release-template-"));
  const bin = join(cwd, "test-bin");
  mkdirSync(bin);
  copyFileSync(new URL("../fixtures/release-npm.mjs", import.meta.url), join(bin, "npm"));
  chmodSync(join(bin, "npm"), 0o755);
  gitIn(cwd, ["init", "-q", "--initial-branch=main"]);
  writeJsonIn(cwd, "package.json", { name: "release-fixture", version, private: true });
  writeJsonIn(cwd, "packages/a-app/package.json", {
    name: "@mrclrchtr/test-app",
    version,
    dependencies: { "@mrclrchtr/test-core": "workspace:*" },
  });
  writeJsonIn(cwd, "packages/z-core/package.json", { name: "@mrclrchtr/test-core", version });
  writeJsonIn(cwd, "packages/zz-private/package.json", { private: true, version: "0.0.0" });
  // A relative link stays valid in every copy and is committed like the other package files.
  const scopeDir = join(cwd, "packages/a-app/node_modules/@mrclrchtr");
  mkdirSync(scopeDir, { recursive: true });
  symlinkSync("../../../z-core", join(scopeDir, "test-core"), "dir");
  let sha = commitIn(cwd);
  if (extend) sha = extend({ cwd, git: (args) => gitIn(cwd, args) }) ?? sha;
  return { cwd, sha };
}

/**
 * Create a real Git checkout with npm replaced by a local recording command.
 *
 * `template` adds shared setup to the copied checkout: `key` names it within the test file, and
 * `extend({ cwd, git })` runs once after the base commit and may return the new HEAD commit.
 */
export function createReleaseFixture({ version = "6.3.1", template } = {}) {
  const templateKey = `${version}:${template?.key ?? ""}`;
  if (!templates.has(templateKey)) {
    templates.set(templateKey, buildTemplate(version, template?.extend));
  }
  const source = templates.get(templateKey);
  const cwd = mkdtempSync(join(tmpdir(), "supi-release-test-"));
  cpSync(source.cwd, cwd, { recursive: true, verbatimSymlinks: true });
  const bin = join(cwd, "test-bin");
  const log = join(cwd, "npm.jsonl");
  const sha = source.sha;
  const git = (args) => gitIn(cwd, args);
  const writeJson = (path, value) => writeJsonIn(cwd, path, value);
  const commit = () => commitIn(cwd);

  function updateJson(path, fields) {
    writeJson(path, { ...JSON.parse(readFileSync(join(cwd, path), "utf8")), ...fields });
  }

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
