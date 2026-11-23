import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGES_DIR = new URL("../../packages", import.meta.url).pathname;

// API-only bundled dependencies: the consumer uses only the dependency's library
// entry points (./api, ./headless), not its registered tools, commands, or hooks.
// They stay bundled but are not forwarded through pi.extensions, so installing the
// consumer adds no extension surface the user did not install. See CLAUDE.md
// Packaging conventions.
const API_ONLY_BUNDLED_DEPENDENCIES = new Map([
  // Headless inspection factory for managed child sessions.
  ["@mrclrchtr/supi-agent", new Set(["@mrclrchtr/supi-code-intelligence"])],
  ["@mrclrchtr/supi-review", new Set(["@mrclrchtr/supi-code-intelligence"])],
  // Ask User form API for the clarification round.
  ["@mrclrchtr/supi-prompt-improver", new Set(["@mrclrchtr/supi-ask-user"])],
]);

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

    const bundled = (pkg.bundledDependencies ?? []).filter(
      (dependency) =>
        dependency.startsWith("@mrclrchtr/") &&
        !API_ONLY_BUNDLED_DEPENDENCIES.get(pkg.name)?.has(dependency),
    );
    if (bundled.length === 0) continue;

    it(`${name} references all bundled pi dependency extensions in pi.extensions`, () => {
      const extensions = pkg.pi?.extensions ?? [];

      // Only check bundled deps that are themselves pi packages (have pi.extensions)
      // Library-only deps like supi-core (after it dropped its extension surface)
      // don't need to be referenced in pi.extensions.
      const missing = bundled.filter((b) => {
        // Check if the bundled dep has its own extension entry
        const depPkgPath = join(dir, "node_modules", b, "package.json");
        try {
          const depPkg = readJson(depPkgPath);
          if (!depPkg.pi?.extensions?.length) return false; // library-only dep
        } catch {
          return false; // can't check — skip
        }
        return !extensions.includes(`node_modules/${b}/src/extension.ts`);
      });

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

  for (const [packageName, dependencies] of API_ONLY_BUNDLED_DEPENDENCIES) {
    it(`${packageName} bundles its API-only dependencies without forwarding their extensions`, () => {
      const pkg = readJson(
        join(PACKAGES_DIR, packageName.replace("@mrclrchtr/", ""), "package.json"),
      );
      for (const dependency of dependencies) {
        expect(pkg.bundledDependencies ?? []).toContain(dependency);
        expect(pkg.pi?.extensions ?? []).not.toContain(
          `node_modules/${dependency}/src/extension.ts`,
        );
      }
    });
  }
});
