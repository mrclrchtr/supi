import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const extrasPackage = readJson(join(repoRoot, "packages/supi-extras/package.json"));
const supiPackage = readJson(join(repoRoot, "packages/supi/package.json"));
const rootPackage = readJson(join(repoRoot, "package.json"));

describe("clipboard packaging", () => {
  it("declares clipboardy for standalone supi-extras installs", () => {
    expect((extrasPackage.dependencies as Record<string, string>).clipboardy).toBeTruthy();
  });

  it("does not duplicate clipboardy in the @mrclrchtr/supi meta-package", () => {
    expect((supiPackage.dependencies as Record<string, string>).clipboardy).toBeUndefined();
  });

  it("declares clipboardy on the root install surface", () => {
    expect((rootPackage.devDependencies as Record<string, string>).clipboardy).toBeTruthy();
  });
});
