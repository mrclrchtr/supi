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

  it("runs the required gate even when a dependency fails, since GitHub treats a skipped required check as passing", () => {
    expect(verify).toContain(
      "if: always() && (needs.ci-plan.result != 'success' || needs.ci-plan.outputs.mode != 'none')",
    );
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
