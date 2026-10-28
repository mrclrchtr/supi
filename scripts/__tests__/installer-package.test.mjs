import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";
import { packStaged } from "../pack-staged.mjs";

it("packs a standalone executable with no PI extension surface or build output", {
  timeout: 120_000,
}, async () => {
  const directory = mkdtempSync(join(tmpdir(), "supi-installer-pack-"));
  try {
    const tarball = await packStaged("packages/supi-installer", { outDir: directory });
    execFileSync("tar", ["-xzf", tarball, "-C", directory]);
    const root = join(directory, "package");
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(manifest.bin).toEqual({ "supi-installer": "bin/supi-installer.mjs" });
    expect(manifest.pi).toBeUndefined();
    expect(manifest.exports).toBeUndefined();
    expect(manifest.devDependencies).toBeUndefined();
    expect(readFileSync(join(root, manifest.bin["supi-installer"]), "utf8")).toMatch(
      /^#!\/usr\/bin\/env node/,
    );
    expect(statSync(join(root, manifest.bin["supi-installer"])).mode & 0o111).not.toBe(0);
    // Supply only declared runtime dependencies; the CLI itself must load from the tarball.
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      const source = [
        resolve(import.meta.dirname, "../../packages/supi-installer/node_modules", dependency),
        resolve(import.meta.dirname, "../../node_modules", dependency),
      ].find((candidate) => existsSync(candidate));
      if (!source) throw new Error(`Runtime dependency is not installed: ${dependency}`);
      const destination = join(root, "node_modules", dependency);
      mkdirSync(dirname(destination), { recursive: true });
      symlinkSync(source, destination, "junction");
    }

    const help = execFileSync(
      process.execPath,
      [join(root, manifest.bin["supi-installer"]), "--help"],
      { cwd: directory, encoding: "utf8", timeout: 10_000 },
    );
    expect(help).toContain("Usage: supi-installer");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
