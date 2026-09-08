// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub Actions expressions are literal test data.
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createReleaseFixture } from "./helpers/release-fixture.mjs";

const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const releaseJob = workflow.split("\n  release-please:\n")[1].split("\n  publish:\n")[0];
const publishJob = workflow.split("\n  publish:\n")[1];
const steps = publishJob.split(/^ {6}- /m).slice(1);
const identityStep = steps.find((step) => step.startsWith("name: Require release identity\n"));
const identityCommand = identityStep.split("run: |\n")[1].replace(/^ {10}/gm, "");
const checkoutStep = steps.find((step) => step.includes("uses: actions/checkout@"));

describe("release workflow handoff", () => {
  it("passes root release outputs without a trigger-commit fallback", () => {
    expect(releaseJob).toContain("release_sha: ${{ steps.release.outputs.sha }}");
    expect(releaseJob).toContain("release_version: ${{ steps.release.outputs.version }}");
    expect(publishJob).toContain("RELEASE_SHA: ${{ needs.release-please.outputs.release_sha }}");
    expect(publishJob).toContain(
      "RELEASE_VERSION: ${{ needs.release-please.outputs.release_version }}",
    );
    expect(checkoutStep).toContain("ref: ${{ env.RELEASE_SHA }}");
    expect(releaseJob).toContain("needs: [actionlint, conventional-commits, verify]");
    expect(publishJob).toContain("needs: release-please");
  });

  it("keeps publication gated on a release from a main push", () => {
    const condition = publishJob.match(/^ {4}if: (.+)$/m)[1];
    expect(condition).toBe(
      "github.event_name == 'push' && github.ref == 'refs/heads/main' && needs.release-please.outputs.releases_created == 'true'",
    );
  });

  it("requires identity before checkout and validates before dependency setup", () => {
    expect(steps[0]).toBe(identityStep);
    expect(steps[1]).toBe(checkoutStep);
    expect(steps[2]).toContain("run: node scripts/release-validation.mjs");
    expect(steps[3]).toContain("uses: ./.github/actions/setup-pnpm");
    expect(steps[4]).toContain("run: node scripts/publish-released.mjs");
    expect(steps).toHaveLength(5);
  });

  it.each([
    ["RELEASE_SHA", undefined],
    ["RELEASE_SHA", ""],
    ["RELEASE_SHA", "main"],
    ["RELEASE_SHA", "abc1234"],
    ["RELEASE_VERSION", undefined],
    ["RELEASE_VERSION", ""],
  ])("stops before checkout when %s is %j", (field, value) => {
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", identityCommand], {
      encoding: "utf8",
      env: {
        ...process.env,
        RELEASE_SHA: "a".repeat(40),
        RELEASE_VERSION: "6.3.1",
        [field]: value,
      },
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`${field}: expected`);
    expect(result.stdout).toContain("actual");
  });

  it("publishes the release checkout, not an older trigger or newer main", () => {
    const fixture = createReleaseFixture({ version: "6.3.0" });
    try {
      const triggerSha = fixture.sha;
      for (const path of [
        "package.json",
        "packages/a-app/package.json",
        "packages/z-core/package.json",
      ]) {
        fixture.updateJson(path, { version: "6.3.1" });
      }
      fixture.writeJson(".release-please-manifest.json", { ".": "6.3.1" });
      fixture.writeJson("packages/release-only/package.json", {
        name: "@mrclrchtr/release-only",
        version: "6.3.1",
        private: false,
      });
      const releaseSha = fixture.commit();
      rmSync(join(fixture.cwd, "packages/release-only"), { recursive: true });
      fixture.writeJson("packages/main-only/package.json", {
        name: "@mrclrchtr/main-only",
        version: "6.4.0",
      });
      const mainSha = fixture.commit();
      fixture.git(["checkout", "--detach", triggerSha]);

      const env = {
        ...fixture.env,
        RELEASE_SHA: releaseSha,
        RELEASE_VERSION: "6.3.1",
        GITHUB_SHA: triggerSha,
      };
      const guard = spawnSync("bash", ["-e", "-o", "pipefail", "-c", identityCommand], {
        cwd: fixture.cwd,
        env,
        encoding: "utf8",
      });
      expect(guard.status, guard.stderr).toBe(0);
      const ref = checkoutStep.match(/^ {10}ref: (.+)$/m)[1];
      fixture.git(["checkout", "--detach", ref.replace("${{ env.RELEASE_SHA }}", env.RELEASE_SHA)]);
      expect(fixture.git(["rev-parse", "HEAD"])).toBe(releaseSha);
      expect(fixture.git(["rev-parse", "main"])).toBe(mainSha);

      const validation = fixture.run(env, { validateOnly: true });
      expect(validation.status, validation.stderr).toBe(0);
      expect(fixture.events()).toEqual([]);
      const publication = fixture.run(env);
      expect(publication.status, publication.stderr).toBe(0);
      expect(
        fixture
          .events()
          .filter((event) => event.args[0] === "publish")
          .map((event) => ({
            name: event.manifest.name,
            version: event.manifest.version,
          })),
      ).toEqual([
        { name: "@mrclrchtr/release-only", version: "6.3.1" },
        { name: "@mrclrchtr/test-core", version: "6.3.1" },
        { name: "@mrclrchtr/test-app", version: "6.3.1" },
      ]);
    } finally {
      fixture.cleanup();
    }
  });
});
