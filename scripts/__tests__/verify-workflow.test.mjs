// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub Actions expressions are literal test data.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const job = (name) => workflow.split(`\n  ${name}:\n`)[1]?.split(/^ {2}[\w-]+:\n/m)[0] ?? "";
const verify = job("verify");
const gate =
  verify.match(/^ {8}run: \|\n((?: {10}.*\n)+)/m)?.[1]?.replace(/^ {10}/gm, "") ?? "exit 99";

function runGate(overrides = {}) {
  return spawnSync("bash", ["-e", "-o", "pipefail", "-c", gate], {
    encoding: "utf8",
    env: {
      ...process.env,
      MODE: "full",
      PLAN_RESULT: "success",
      WORKFLOW_LINT_RESULT: "success",
      COMMITS_RESULT: "success",
      WORKSPACE_RESULT: "success",
      TEST_RESULT: "success",
      INSTALLER_RESULT: "success",
      LANGUAGE_BASELINE_RESULT: "success",
      ...overrides,
    },
  });
}

/** Evaluate the workflow-level concurrency group; absent event fields read as empty, as in Actions. */
function concurrencyGroup({ event = {}, ...github }) {
  const expression = workflow
    .match(
      /^concurrency:\n {2}group: >-\n {4}\$\{\{ github\.workflow \}\}-\$\{\{\n((?: {6}.+\n)+) {4}\}\}/m,
    )[1]
    .replace(/\s+/g, " ");
  return runInNewContext(expression, {
    github: {
      event: { pull_request: {}, head_commit: {}, ...event },
      ref: "refs/heads/main",
      run_id: 7,
      ...github,
    },
    startsWith: (value, prefix) => String(value ?? "").startsWith(prefix),
  });
}

describe("workflow concurrency", () => {
  it("lets newer ordinary main pushes and PR updates supersede older runs", () => {
    const push = { event_name: "push", event: { head_commit: { message: "fix: change" } } };
    expect(concurrencyGroup(push)).toBe("refs/heads/main");
    expect(
      concurrencyGroup({ event_name: "pull_request", event: { pull_request: { number: 42 } } }),
    ).toBe(42);
  });

  it("never shares a group with a release candidate or manual run", () => {
    for (const message of ["chore: release 6.3.1", "chore: release 6.3.1 (#42)"]) {
      expect(concurrencyGroup({ event_name: "push", event: { head_commit: { message } } })).toBe(7);
    }
    expect(concurrencyGroup({ event_name: "workflow_dispatch" })).toBe(7);
    expect(workflow).toContain(
      "cancel-in-progress: ${{ github.event_name != 'workflow_dispatch' }}",
    );
  });
});

describe("verification workflow contracts", () => {
  it("uses the immutable planned SHA for every check, including manual tag retries", () => {
    for (const name of [
      "workflow-lint",
      "conventional-commits",
      "workspace-checks",
      "tests",
      "language-baseline",
      "installer",
    ]) {
      expect(job(name)).toContain("needs: ci-plan");
      expect(job(name)).toContain("ref: ${{ needs.ci-plan.outputs.sha }}");
    }
    const plan = job("ci-plan");
    expect(plan).toContain("ref: ${{ github.sha }}");
    expect(plan).toContain("fetch-depth: 0");
    expect(plan).not.toContain("setup-pnpm");
    expect(plan).toContain("node scripts/ci-plan.mjs");
  });

  it("runs the required gate even when a dependency fails, since GitHub treats a skipped required check as passing", () => {
    expect(verify).toContain("if: always()\n");
  });

  it.each(["full", "checks"])("accepts a complete successful %s verification", (mode) => {
    expect(runGate({ MODE: mode }).status).toBe(0);
  });

  it.each([
    "PLAN_RESULT",
    "WORKFLOW_LINT_RESULT",
    "COMMITS_RESULT",
    "WORKSPACE_RESULT",
    "TEST_RESULT",
    "INSTALLER_RESULT",
    "LANGUAGE_BASELINE_RESULT",
  ])("requires %s in every verification mode", (field) => {
    for (const mode of ["full", "checks"]) {
      for (const result of ["failure", "cancelled", "skipped", ""]) {
        expect(runGate({ MODE: mode, [field]: result }).status, `${mode}: ${field}=${result}`).toBe(
          1,
        );
      }
    }
  });

  it.each(["", "unknown"])("rejects unknown/non-verifying mode %j at the required gate", (mode) => {
    expect(runGate({ MODE: mode }).status).toBe(1);
  });
});
