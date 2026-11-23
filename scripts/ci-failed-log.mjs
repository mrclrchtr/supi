#!/usr/bin/env node
/**
 * Print the failure excerpts of a GitHub Actions run's failed jobs.
 *
 * Usage: node scripts/ci-failed-log.mjs <run-id> [--attempt N]
 *
 * `gh run view --log-failed` streams the whole run log and often aborts with a
 * stream error; `gh api .../logs` refuses ANSI output without
 * `--allow-escape-sequences`. This script reads one job log at a time through the
 * API, retries transient GitHub errors, strips timestamps and ANSI codes, and
 * prints the Vitest failure section or the lines around each error marker.
 */
import { execFileSync } from "node:child_process";

const MAX_EXCERPT_LINES = 150;
const ERROR_MARKER = /##\[error\]|AssertionError|^\s*FAIL\s|^\s*×|Error: /;

function gh(args, { retries = 3 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return execFileSync("gh", args, {
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const detail = String(error.stderr || error.message);
      const transient = /HTTP 5\d\d|stream error|timeout|ECONNRESET/i.test(detail);
      if (!transient || attempt >= retries)
        throw new Error(`gh ${args.join(" ")}: ${detail.trim()}`, { cause: error });
      execFileSync("sleep", [String(attempt * 5)]);
    }
  }
}

function ghJson(path) {
  return JSON.parse(gh(["api", path]));
}

function clean(log) {
  return log
    .replaceAll(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g"), "")
    .split("\n")
    .map((line) => line.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z ?/, "").trimEnd());
}

/** Vitest's failure section when present; otherwise context windows around error markers. */
function excerpt(lines) {
  const start = lines.findIndex((line) => /⎯+ Failed Tests? \d+ ⎯+/.test(line));
  if (start >= 0) {
    const summary = lines.findIndex((line, index) => index > start && /^\s*Tests\s+\d/.test(line));
    return lines.slice(start, summary >= 0 ? summary + 1 : undefined);
  }
  const keep = new Set();
  lines.forEach((line, index) => {
    if (!ERROR_MARKER.test(line)) return;
    for (let i = Math.max(0, index - 5); i <= Math.min(lines.length - 1, index + 10); i++)
      keep.add(i);
  });
  const result = [];
  let previous = -2;
  for (const index of [...keep].sort((a, b) => a - b)) {
    if (index !== previous + 1 && result.length > 0) result.push("…");
    result.push(lines[index]);
    previous = index;
  }
  return result;
}

function main() {
  const [runId, ...rest] = process.argv.slice(2);
  if (!runId || !/^\d+$/.test(runId)) {
    console.error("Usage: node scripts/ci-failed-log.mjs <run-id> [--attempt N]");
    process.exit(2);
  }
  const attemptFlag = rest.indexOf("--attempt");
  const repo =
    process.env.GITHUB_REPOSITORY ||
    gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).trim();
  const run = ghJson(`repos/${repo}/actions/runs/${runId}`);
  const attempt = attemptFlag >= 0 ? rest[attemptFlag + 1] : run.run_attempt;
  console.log(
    `Run ${runId} attempt ${attempt}: ${run.status} ${run.conclusion ?? ""} (${run.html_url})`,
  );

  const { jobs } = ghJson(
    `repos/${repo}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`,
  );
  const failed = jobs.filter((job) => job.conclusion === "failure");
  if (failed.length === 0) {
    console.log("No failed jobs.");
    return;
  }
  for (const job of failed) printJob(repo, job);
}

function printJob(repo, job) {
  const steps = (job.steps ?? [])
    .filter((step) => step.conclusion === "failure")
    .map((s) => s.name);
  console.log(`\n## ${job.name} (job ${job.id})`);
  if (steps.length > 0) console.log(`Failed steps: ${steps.join("; ")}`);
  let log;
  try {
    log = gh(["api", "--allow-escape-sequences", `repos/${repo}/actions/jobs/${job.id}/logs`]);
  } catch (error) {
    console.log(`Log unavailable: ${error.message}`);
    return;
  }
  const lines = excerpt(clean(log));
  if (lines.length === 0) {
    console.log("No error markers found; inspect the failed steps above.");
    return;
  }
  console.log(lines.slice(0, MAX_EXCERPT_LINES).join("\n"));
  if (lines.length > MAX_EXCERPT_LINES) {
    console.log(`… ${lines.length - MAX_EXCERPT_LINES} more lines omitted`);
  }
}

main();
