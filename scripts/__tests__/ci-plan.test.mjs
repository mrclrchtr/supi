import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { selectCiJobs } from "../ci-plan.mjs";

const packages = new Set([
  "supi-core",
  "supi-code-intelligence",
  "supi-installer",
  "supi-extras",
  "supi-skill-patches",
]);

const temporaryDirectories = [];
afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function repository() {
  const root = mkdtempSync(join(tmpdir(), "supi-ci-plan-"));
  temporaryDirectories.push(root);
  const cwd = join(root, "repo");
  mkdirSync(cwd);
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(root, "no-global-config"),
    GIT_AUTHOR_NAME: "CI test",
    GIT_AUTHOR_EMAIL: "ci@example.test",
    GIT_COMMITTER_NAME: "CI test",
    GIT_COMMITTER_EMAIL: "ci@example.test",
  };
  const git = (...args) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
  const write = (path, content) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  };
  const commit = () => {
    git("add", "--all");
    git("commit", "--quiet", "-m", "test: fixture");
    return git("rev-parse", "HEAD");
  };
  git("init", "--quiet", "--initial-branch=main");
  for (const name of packages) write(`packages/${name}/package.json`, JSON.stringify({ name }));
  write("packages/supi-core/src/config.ts", "export const original = true;\n");
  const base = commit();
  const run = (eventName, event, sha = git("rev-parse", "HEAD")) => {
    const output = join(root, "outputs");
    const summary = join(root, "summary");
    writeFileSync(join(root, "event.json"), JSON.stringify(event));
    writeFileSync(output, "");
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../ci-plan.mjs", import.meta.url))],
      {
        cwd,
        encoding: "utf8",
        env: {
          ...env,
          GITHUB_EVENT_NAME: eventName,
          GITHUB_EVENT_PATH: join(root, "event.json"),
          GITHUB_SHA: sha,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
        },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    return {
      outputs: Object.fromEntries(
        readFileSync(output, "utf8")
          .trim()
          .split("\n")
          .map((line) => line.split("=")),
      ),
      summary: readFileSync(summary, "utf8"),
    };
  };
  return { cwd, base, git, write, commit, run };
}

describe("CI matrix selection", () => {
  it.each([
    [["docs/INDEX.md", "README.md"], { languageBaseline: false, installer: false }],
    [["packages/supi-extras/src/extension.ts"], { languageBaseline: false, installer: false }],
    [["packages/supi-core/src/config.ts"], { languageBaseline: true, installer: false }],
    [["packages/supi-installer/src/cli.mjs"], { languageBaseline: false, installer: true }],
    [["packages/supi-extras/package.json"], { languageBaseline: true, installer: true }],
    [["new-infrastructure/config.json"], { languageBaseline: true, installer: true }],
    [["packages/new-package/src/api.ts"], { languageBaseline: true, installer: true }],
    [
      ["packages/supi-code-intelligence/__tests__/fixtures/README.md"],
      { languageBaseline: true, installer: false },
    ],
    [["scripts/language-baseline/pins.json"], { languageBaseline: true, installer: false }],
    [
      ["packages/supi-skill-patches/patches/upstream.patch"],
      { languageBaseline: false, installer: true },
    ],
    [
      ["packages/supi-core/src/api.ts", "packages/supi-installer/bin/cli.mjs"],
      { languageBaseline: true, installer: true },
    ],
  ])("selects the required matrices for %j", (paths, expected) => {
    expect(selectCiJobs(paths, packages)).toEqual(expected);
  });
});

describe("conservative shared inputs", () => {
  it.each([
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".npmrc",
    ".gitattributes",
    ".mise.toml",
    "mise.lock",
    "tsconfig.json",
    "vitest.config.ts",
    "vitest.workspace.ts",
    ".github/actions/setup-pnpm/action.yml",
    ".github/workflows/ci.yml",
    "scripts/ci-plan.mjs",
    "scripts/pack-staged.mjs",
    "scripts/__tests__/patch-checkout.test.mjs",
  ])("runs both matrices when %s changes", (path) => {
    expect(selectCiJobs([path], packages)).toEqual({ languageBaseline: true, installer: true });
  });

  it("covers the language baseline's current workspace dependency closure", () => {
    const root = fileURLToPath(new URL("../../packages/", import.meta.url));
    const manifests = new Map(
      readdirSync(root)
        .filter((directory) => existsSync(join(root, directory, "package.json")))
        .map((directory) => {
          const manifest = JSON.parse(readFileSync(join(root, directory, "package.json"), "utf8"));
          return [manifest.name, { directory, manifest }];
        }),
    );
    const known = new Set([...manifests.values()].map(({ directory }) => directory));
    const pending = ["@mrclrchtr/supi-code-intelligence", "@mrclrchtr/supi-test-utils"];
    const visited = new Set();
    while (pending.length > 0) {
      const name = pending.pop();
      if (visited.has(name)) continue;
      visited.add(name);
      const { directory, manifest } = manifests.get(name);
      expect(selectCiJobs([`packages/${directory}/src/api.ts`], known).languageBaseline, name).toBe(
        true,
      );
      for (const dependency of Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.peerDependencies,
        ...manifest.optionalDependencies,
      })) {
        if (manifests.has(dependency)) pending.push(dependency);
      }
    }
  });
});

describe("CI planning command", () => {
  it("compares the PR merge tree against its actual main-side parent", () => {
    const repo = repository();
    repo.git("checkout", "--quiet", "-b", "feature");
    repo.write("packages/supi-extras/src/extension.ts", "export const feature = true;\n");
    const head = repo.commit();
    repo.git("checkout", "--quiet", "main");
    repo.write("packages/supi-core/src/config.ts", "export const updatedOnMain = true;\n");
    const base = repo.commit();
    repo.git("merge", "--quiet", "--no-ff", "feature", "-m", "test: synthetic PR merge");
    const plan = repo.run("pull_request", {
      pull_request: { base: { sha: base }, head: { sha: head } },
    });
    expect(plan.outputs).toEqual({ "language-baseline": "false", installer: "false" });
    const stale = repo.run("pull_request", {
      pull_request: { base: { sha: repo.base }, head: { sha: head } },
    });
    expect(stale.outputs).toEqual({ "language-baseline": "true", installer: "true" });
  }, 10_000);

  it("compares the entire push, not only its last commit", () => {
    const repo = repository();
    repo.write("packages/supi-core/src/config.ts", "export const changed = true;\n");
    repo.commit();
    repo.write("README.md", "Documentation\n");
    const after = repo.commit();
    const plan = repo.run("push", { before: repo.base, after });
    expect(plan.outputs).toEqual({ "language-baseline": "true", installer: "false" });
    expect(plan.summary).toContain("push");
  }, 10_000);

  it.each(["delete", "rename"])(
    "includes the original path of a %s",
    (operation) => {
      const repo = repository();
      const original = "packages/supi-core/src/config.ts";
      if (operation === "delete") {
        repo.git("rm", original);
      } else {
        repo.git("mv", original, "packages/supi-extras/moved.ts");
      }
      const after = repo.commit();
      expect(repo.run("push", { before: repo.base, after }).outputs).toEqual({
        "language-baseline": "true",
        installer: "false",
      });
    },
    10_000,
  );

  it("preserves unusual filenames in Git's NUL-delimited diff", () => {
    const repo = repository();
    repo.write("packages/supi-installer/new\nname.mjs", "export {};\n");
    const after = repo.commit();
    expect(repo.run("push", { before: repo.base, after }).outputs).toEqual({
      "language-baseline": "false",
      installer: "true",
    });
  }, 10_000);

  it.each([
    "missing-history",
    "new-branch",
    "wrong-checkout",
    "non-merge-pr",
    "unsupported-event",
    "manual",
  ])(
    "runs both matrices for %s",
    (scenario) => {
      const repo = repository();
      repo.write("README.md", "Only docs changed\n");
      const after = repo.commit();
      let eventName = "push";
      let event = { before: repo.base, after };
      let sha = after;
      if (scenario === "missing-history") event.before = "f".repeat(40);
      if (scenario === "new-branch") event.before = "0".repeat(40);
      if (scenario === "wrong-checkout") sha = repo.base;
      if (scenario === "non-merge-pr") {
        eventName = "pull_request";
        event = { pull_request: { base: { sha: repo.base }, head: { sha: after } } };
      }
      if (scenario === "unsupported-event") eventName = "schedule";
      if (scenario === "manual") eventName = "workflow_dispatch";
      const plan = repo.run(eventName, event, sha);
      expect(plan.outputs).toEqual({ "language-baseline": "true", installer: "true" });
      expect(plan.summary.toLowerCase()).toContain("full verification");
    },
    10_000,
  );
});
