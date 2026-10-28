// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub Actions expressions are literal test data.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");

function job(name) {
  return workflow.split(`\n  ${name}:\n`)[1]?.split(/^ {2}[\w-]+:\n/m)[0] ?? "";
}

const workspace = job("workspace-checks");
const tests = job("tests");
const verify = job("verify");
const installer = job("installer");
const languageBaseline = job("language-baseline");
const gate =
  verify.match(/^ {8}run: \|\n((?: {10}.*\n)+)/m)?.[1]?.replace(/^ {10}/gm, "") ?? "exit 99";

describe("parallel verification workflow", () => {
  it("runs all non-test checks once, without waiting for the test jobs", () => {
    expect(workspace).not.toMatch(/^ {4}needs:/m);
    expect(workspace).toContain("Check release-please config coverage");
    for (const command of [
      "pnpm --filter @mrclrchtr/supi-tree-sitter check:all-wasm",
      "pnpm biome",
      "pnpm typecheck",
      "pnpm skills:check",
      "pnpm pack:verify",
    ]) {
      expect(workspace).toContain(`run: ${command}\n`);
    }
    expect(workspace).not.toMatch(/run: pnpm (?:test|verify)\n/);
  });

  it("runs the complete test suite once with normal isolation and required tools", () => {
    expect(tests).not.toMatch(/^ {4}needs:/m);
    expect(tests).not.toContain("strategy:");
    expect(tests).not.toContain("--shard");
    expect(tests).toContain("uses: ./.github/actions/setup-pnpm");
    expect(tests).toContain("run: sudo apt-get install -y ripgrep");
    expect(tests).toContain("run: pnpm test:ai\n");
    expect(tests).not.toMatch(/--(?:no-isolate|exclude|project|passWithNoTests)/);
    expect(tests).not.toContain("continue-on-error:");
  });

  it("keeps verify as the required result and release dependency", () => {
    expect(verify).toContain(
      "needs: [ci-plan, workspace-checks, tests, installer, language-baseline]",
    );
    expect(verify).toContain("PLAN_RESULT: ${{ needs.ci-plan.result }}");
    expect(verify).toContain("if: always()");
    expect(verify).toContain("WORKSPACE_RESULT: ${{ needs.workspace-checks.result }}");
    expect(verify).toContain("TEST_RESULT: ${{ needs.tests.result }}");
    expect(verify).toContain("LANGUAGE_BASELINE_RESULT: ${{ needs.language-baseline.result }}");
    expect(job("release-please")).toContain("needs: [actionlint, conventional-commits, verify]");
  });

  it("plans matrices without installing dependencies and supports manual full verification", () => {
    const plan = job("ci-plan");
    expect(workflow).toContain("  workflow_dispatch:");
    expect(plan).toContain("fetch-depth: 0");
    expect(plan).toContain("ref: ${{ github.sha }}");
    expect(plan).toContain("run: node scripts/ci-plan.mjs");
    expect(plan).not.toContain("setup-pnpm");
    for (const [name, body] of [
      ["language-baseline", languageBaseline],
      ["installer", installer],
    ]) {
      expect(plan).toContain(`${name}: \u0024{{ steps.plan.outputs.${name} }}`);
      expect(body).toContain("needs: ci-plan");
      expect(body).toContain(`if: needs.ci-plan.outputs.${name} == 'true'`);
    }
  });

  it("requires pinned live language-server checks on Linux and macOS", () => {
    expect(languageBaseline).toContain("os: [avrea-ubuntu-latest-2-vcpu, macos-latest]");
    expect(languageBaseline).toContain("node scripts/language-baseline/provision.mjs");
    expect(languageBaseline).toContain("pnpm test:language-baseline:acceptance");
    expect(languageBaseline).not.toContain("continue-on-error:");
  });

  it("checks the CLI on supported systems and the minimum Node runtime", () => {
    expect(installer).toContain("os: [avrea-ubuntu-latest-2-vcpu, macos-latest, windows-latest]");
    expect(installer).toContain('node: ["24"]');
    expect(installer).toContain('- os: avrea-ubuntu-latest-2-vcpu\n            node: "22.19.0"');
    expect(installer).toContain(
      "pnpm vitest run packages/supi-installer/ scripts/__tests__/patch-checkout.test.mjs --reporter=agent",
    );
    expect(verify).toContain("INSTALLER_RESULT: ${{ needs.installer.result }}");
  });

  function runGate(overrides = {}) {
    return spawnSync("bash", ["-e", "-o", "pipefail", "-c", gate], {
      encoding: "utf8",
      env: {
        ...process.env,
        PLAN_RESULT: "success",
        WORKSPACE_RESULT: "success",
        TEST_RESULT: "success",
        RUN_INSTALLER: "true",
        RUN_LANGUAGE_BASELINE: "true",
        INSTALLER_RESULT: "success",
        LANGUAGE_BASELINE_RESULT: "success",
        ...overrides,
      },
    });
  }

  it("accepts a successful complete run", () => {
    expect(runGate().status).toBe(0);
  });

  it.each(["PLAN_RESULT", "WORKSPACE_RESULT", "TEST_RESULT"])(
    "requires success from %s even when both matrices are intentionally skipped",
    (name) => {
      for (const result of ["failure", "cancelled", "skipped", ""]) {
        expect(
          runGate({
            [name]: result,
            RUN_INSTALLER: "false",
            RUN_LANGUAGE_BASELINE: "false",
            INSTALLER_RESULT: "skipped",
            LANGUAGE_BASELINE_RESULT: "skipped",
          }).status,
          `${name}=${result}`,
        ).toBe(1);
      }
    },
  );

  it.each(["INSTALLER", "LANGUAGE_BASELINE"])(
    "only accepts the planned result for %s",
    (matrix) => {
      for (const selected of ["true", "false", "", "invalid"]) {
        for (const result of ["success", "failure", "cancelled", "skipped", ""]) {
          const expected =
            (selected === "true" && result === "success") ||
            (selected === "false" && result === "skipped")
              ? 0
              : 1;
          expect(
            runGate({ [`RUN_${matrix}`]: selected, [`${matrix}_RESULT`]: result }).status,
            `${matrix}: selected=${selected}, result=${result}`,
          ).toBe(expected);
        }
      }
    },
  );

  it("accepts both matrices being intentionally skipped", () => {
    expect(
      runGate({
        RUN_INSTALLER: "false",
        RUN_LANGUAGE_BASELINE: "false",
        INSTALLER_RESULT: "skipped",
        LANGUAGE_BASELINE_RESULT: "skipped",
      }).status,
    ).toBe(0);
  });
});
