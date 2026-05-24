import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGES_DIR = new URL("../../packages", import.meta.url).pathname;

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

/**
 * Each publishable package that bundles @mrclrchtr/* dependencies must
 * reference their extension entrypoints in pi.extensions via
 * node_modules/<pkg>/src/extension.ts. Without this, standalone
 * pi install of the package won't load the bundled extensions.
 */
describe("bundled extension references", () => {
  const packageDirs = readdirSync(PACKAGES_DIR)
    .filter((name) => name.startsWith("supi-"))
    .map((name) => join(PACKAGES_DIR, name))
    .filter((dir) => {
      try {
        return statSync(join(dir, "package.json")).isFile();
      } catch {
        return false;
      }
    });

  for (const dir of packageDirs) {
    const pkg = readJson(join(dir, "package.json"));
    const name = pkg.name;
    if (!name) continue;

    const bundled = (pkg.bundledDependencies ?? []).filter((b) => b.startsWith("@mrclrchtr/"));
    if (bundled.length === 0) continue;

    it(`${name} references all bundled pi dependency extensions in pi.extensions`, () => {
      const extensions = pkg.pi?.extensions ?? [];
      const missing = bundled.filter(
        (b) => !extensions.includes(`node_modules/${b}/src/extension.ts`),
      );

      expect(
        missing,
        [
          `Package bundles @mrclrchtr/* dependencies but is missing pi.extensions entries for:`,
          ...missing.map((b) => `  - ${b} (add "node_modules/${b}/src/extension.ts")`),
          "",
          "pi only reads the top-level installed package's pi.extensions manifest.",
          "Bundled pi dependency extensions must be referenced via node_modules/ paths",
          "for standalone pi install to load them. See CLAUDE.md Packaging conventions.",
        ].join("\n"),
      ).toEqual([]);
    });
  }
});
