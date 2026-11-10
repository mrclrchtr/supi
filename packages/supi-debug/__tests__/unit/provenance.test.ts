import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectRuntimeProvenance } from "../../src/provenance.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workspace(name: string): { root: string; packageDir: string } {
  const root = mkdtempSync(join(tmpdir(), "supi-provenance-"));
  roots.push(root);
  const packageDir = join(root, "packages", "supi-debug");
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name }));
  writeFileSync(join(packageDir, "package.json"), JSON.stringify({ version: "1.2.3" }));
  return { root, packageDir };
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function commitAll(root: string): void {
  git(root, "init", "-q");
  git(root, "add", ".");
  git(
    root,
    ...["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"],
    ...["-c", "core.hooksPath=/dev/null", "commit", "-qm", "init"],
  );
}

describe("collectRuntimeProvenance", () => {
  it("reports commit, commit time, and dirty state for a SuPi workspace checkout", async () => {
    const { root, packageDir } = workspace("@mrclrchtr/supi-workspace");
    commitAll(root);

    const clean = await collectRuntimeProvenance(packageDir);
    expect(clean).toEqual({
      version: "1.2.3",
      commit: git(root, "rev-parse", "HEAD"),
      commitTime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      dirty: false,
    });

    writeFileSync(join(packageDir, "package.json"), JSON.stringify({ version: "1.2.4" }));
    expect(await collectRuntimeProvenance(packageDir)).toMatchObject({
      version: "1.2.4",
      dirty: true,
    });
  });

  it("reports only the version when installed inside another repository", async () => {
    const { root, packageDir } = workspace("someone-elses-app");
    commitAll(root);

    expect(await collectRuntimeProvenance(packageDir)).toEqual({ version: "1.2.3" });
  });
});
