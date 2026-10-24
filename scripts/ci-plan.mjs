import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const languagePackages = new Set([
  "supi-code-intelligence",
  "supi-code-runtime",
  "supi-core",
  "supi-lsp",
  "supi-test-utils",
  "supi-tree-sitter",
]);
const installerPackages = new Set(["supi-installer", "supi-skill-patches", "supi-test-utils"]);
const allJobs = { languageBaseline: true, installer: true };
const noJobs = { languageBaseline: false, installer: false };

function jobsForPath(path, packageNames) {
  const [directory, name, ...parts] = path.split("/");
  if (directory === "packages") {
    // All workspace manifest changes can alter dependency resolution or package relationships.
    if (!packageNames.has(name) || parts.join("/") === "package.json") return allJobs;
    return {
      languageBaseline: languagePackages.has(name),
      installer: installerPackages.has(name),
    };
  }
  if (path.startsWith("scripts/language-baseline/")) {
    return { languageBaseline: true, installer: false };
  }
  if (
    ["docs", "assets", "screenshots", "skills"].includes(directory) ||
    (!path.includes("/") && (path.endsWith(".md") || path === "LICENSE"))
  ) {
    return noJobs;
  }
  // Shared scripts, configuration, patches' Git attributes, and unknown infrastructure run both.
  return allJobs;
}

/**
 * Select only the expensive matrices; normal workspace checks and tests always run.
 * Package-wide rules intentionally include docs and fixtures. Unknown packages run both matrices.
 * @param {string[]} paths Changed paths, including deletions and both sides of renames.
 * @param {Set<string>} packageNames Current workspace package directory names.
 */
export function selectCiJobs(paths, packageNames) {
  const selected = { ...noJobs };
  for (const path of paths) {
    const jobs = jobsForPath(path, packageNames);
    selected.languageBaseline ||= jobs.languageBaseline;
    selected.installer ||= jobs.installer;
  }
  return selected;
}

function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 8 * 1024 * 1024,
  });
}

function requireSha(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value) || /^0+$/.test(value)) {
    throw new Error("Missing or invalid comparison commit");
  }
  return value;
}

function comparisonBase(eventName, event, sha) {
  if (eventName === "pull_request") {
    const base = requireSha(event.pull_request?.base?.sha);
    const head = requireSha(event.pull_request?.head?.sha);
    const parents = git("rev-list", "--parents", "-n", "1", sha).trim().split(" ");
    if (parents.length !== 3 || parents[1] !== base || parents[2] !== head) {
      throw new Error("Checkout is not the expected PR merge");
    }
    return base;
  }
  if (eventName === "push" && event.after === sha) {
    const base = requireSha(event.before);
    git("merge-base", "--is-ancestor", base, sha);
    return base;
  }
  throw new Error("Unsupported comparison");
}

/** Missing history or uncertain event data must never suppress a verification matrix. */
function createPlan() {
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (eventName === "workflow_dispatch") return { ...allJobs, reason: "Manual full verification" };
  try {
    const sha = requireSha(process.env.GITHUB_SHA);
    if (git("rev-parse", "HEAD").trim() !== sha) throw new Error("Checkout does not match event");
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    const base = comparisonBase(eventName, event, sha);
    // Disable rename detection so moving a file out of a relevant package still selects its checks.
    const paths = git("diff", "--name-only", "--no-renames", "-z", base, sha, "--")
      .split("\0")
      .filter(Boolean);
    const packageNames = new Set(
      readdirSync("packages").filter((name) => existsSync(join("packages", name, "package.json"))),
    );
    return {
      ...selectCiJobs(paths, packageNames),
      reason: `${eventName}: compared ${base} to ${sha}`,
    };
  } catch {
    return { ...allJobs, reason: "Full verification: comparison unavailable or uncertain" };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const plan = createPlan();
  const output = `language-baseline=${plan.languageBaseline}\ninstaller=${plan.installer}\n`;
  appendFileSync(process.env.GITHUB_OUTPUT, output);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## CI matrix selection\n\n${plan.reason}\n\n- Language baseline: ${plan.languageBaseline}\n- Installer: ${plan.installer}\n`,
    );
  }
  console.log(`${plan.reason}\n${output}`);
}
