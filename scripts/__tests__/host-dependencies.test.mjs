import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packagesDir = new URL("../../packages/", import.meta.url);
const hostPackages = [
  "@earendil-works/pi-ai",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
  "typebox",
];

describe("host-provided package dependencies", () => {
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = new URL(`${entry.name}/package.json`, packagesDir);
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    if (pkg.private) continue;

    it(`${pkg.name} leaves host packages to Pi`, () => {
      for (const name of hostPackages) {
        expect(pkg.dependencies ?? {}, name).not.toHaveProperty(name);
        expect(pkg.optionalDependencies ?? {}, name).not.toHaveProperty(name);
        expect(pkg.bundledDependencies ?? [], name).not.toContain(name);
        if (name in (pkg.peerDependencies ?? {})) {
          expect(pkg.peerDependencies[name], name).toBe("*");
        }
      }
    });
  }
});
