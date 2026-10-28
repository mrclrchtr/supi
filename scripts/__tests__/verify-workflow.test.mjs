// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub Actions expressions are literal test data.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
      ACTIONLINT_RESULT: "success",
      COMMITS_RESULT: "success",
      WORKSPACE_RESULT: "success",
      TEST_RESULT: "success",
      INSTALLER_RESULT: "success",
      LANGUAGE_BASELINE_RESULT: "success",
      ...overrides,
    },
  });
}

describe("verification workflow contracts", () => {
  it("uses the immutable planned SHA for every check, including manual tag retries", () => {
    for (const name of [
      "actionlint",
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

  it("reserves packaging, the complete test suite, and both complete matrices for exhaustive verification", () => {
    const workspace = job("workspace-checks");
    expect(workspace).toContain(
      "if: needs.ci-plan.outputs.mode == 'full'\n        run: pnpm pack:verify",
    );
    expect(workspace).toContain(
      "if: needs.ci-plan.outputs.mode != 'metadata'\n        uses: ./.github/actions/setup-pnpm",
    );
    for (const name of ["tests", "language-baseline", "installer"]) {
      expect(job(name)).toContain("if: needs.ci-plan.outputs.mode == 'full'");
      expect(job(name)).not.toContain("continue-on-error:");
    }
    const tests = job("tests");
    expect(tests).toContain("run: pnpm test:ai\n");
    expect(tests).toContain("sudo apt-get install -y ripgrep");
    expect(tests).not.toMatch(/--(?:shard|no-isolate|exclude|project|passWithNoTests)/);
    const baseline = job("language-baseline");
    expect(baseline).toContain("os: [avrea-ubuntu-latest-2-vcpu, macos-latest]");
    expect(baseline).toContain("node scripts/language-baseline/provision.mjs");
    expect(baseline).toContain("pnpm test:language-baseline:acceptance");
    const installer = job("installer");
    expect(installer).toContain("os: [avrea-ubuntu-latest-2-vcpu, macos-latest, windows-latest]");
    expect(installer).toContain('node: "22.19.0"');
    expect(installer).toContain("scripts/__tests__/patch-checkout.test.mjs");
  });

  it("keeps required check names and makes dependency failures visible", () => {
    for (const name of ["actionlint", "conventional-commits", "verify"])
      expect(job(name)).not.toBe("");
    expect(verify).toContain(
      "if: always() && (needs.ci-plan.result != 'success' || needs.ci-plan.outputs.mode != 'none')",
    );
    expect(verify).toContain(
      "needs: [ci-plan, actionlint, conventional-commits, workspace-checks, tests, installer, language-baseline]",
    );
    expect(workflow).toContain("github.event.pull_request.number || github.run_id");
  });

  it("accepts a complete successful release verification", () => {
    expect(runGate().status).toBe(0);
  });

  it.each(["pr", "metadata"])(
    "accepts intentionally skipped exhaustive jobs only in %s mode",
    (mode) => {
      expect(
        runGate({
          MODE: mode,
          TEST_RESULT: "skipped",
          INSTALLER_RESULT: "skipped",
          LANGUAGE_BASELINE_RESULT: "skipped",
        }).status,
      ).toBe(0);
      expect(runGate({ MODE: mode }).status).toBe(1);
    },
  );

  it.each(["PLAN_RESULT", "ACTIONLINT_RESULT", "COMMITS_RESULT", "WORKSPACE_RESULT"])(
    "requires %s in every verification mode",
    (field) => {
      for (const mode of ["full", "pr", "metadata"]) {
        const expected = mode === "full" ? "success" : "skipped";
        const baseline = {
          MODE: mode,
          TEST_RESULT: expected,
          INSTALLER_RESULT: expected,
          LANGUAGE_BASELINE_RESULT: expected,
        };
        expect(runGate(baseline).status).toBe(0);
        for (const result of ["failure", "cancelled", "skipped", ""]) {
          expect(
            runGate({ ...baseline, [field]: result }).status,
            `${mode}: ${field}=${result}`,
          ).toBe(1);
        }
      }
    },
  );

  it.each(["TEST_RESULT", "INSTALLER_RESULT", "LANGUAGE_BASELINE_RESULT"])(
    "rejects failed or missing %s instead of treating it as a planned skip",
    (field) => {
      for (const result of ["failure", "cancelled", "skipped", ""]) {
        expect(runGate({ [field]: result }).status, `${field}=${result}`).toBe(1);
      }
      for (const result of ["success", "failure", "cancelled", ""]) {
        expect(
          runGate({
            MODE: "metadata",
            TEST_RESULT: "skipped",
            INSTALLER_RESULT: "skipped",
            LANGUAGE_BASELINE_RESULT: "skipped",
            [field]: result,
          }).status,
        ).toBe(1);
      }
    },
  );

  it.each(["", "unknown", "none"])(
    "rejects unknown/non-verifying mode %j at the required gate",
    (mode) => {
      expect(runGate({ MODE: mode }).status).toBe(1);
    },
  );
});
