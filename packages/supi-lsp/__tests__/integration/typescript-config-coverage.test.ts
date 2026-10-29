import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, expect, it } from "vitest";
import { clearTsconfigCache, getFileScopeDecision } from "../../src/config/tsconfig-scope.ts";

const require = createRequire(import.meta.url);
const compilers = ["typescript", "@typescript/native"].map((name) => {
  const manifest = require.resolve(`${name}/package.json`);
  const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
  return { name, launcher: path.resolve(path.dirname(manifest), pkg.bin.tsc) };
});
const roots: string[] = [];
afterEach(() => {
  clearTsconfigCache();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function project(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "supi-ts-config-coverage-")));
  roots.push(root);
  return root;
}
function write(root: string, file: string, value: unknown): void {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof value === "string" ? value : JSON.stringify(value));
}

// --showConfig reports config root-file coverage, not the transitive files of a
// TypeScript Program. Keep that distinction even for references and exclusions.
function configFiles(config: string): string[][] {
  return compilers.map(({ name, launcher }) => {
    const result = spawnSync(process.execPath, [launcher, "--showConfig", "-p", config], {
      encoding: "utf8",
    });
    expect(result.status, `${name}: ${result.stdout}\n${result.stderr}`).toBe(0);
    const output = JSON.parse(result.stdout) as { files?: string[] };
    return (output.files ?? []).map((file) => path.resolve(path.dirname(config), file)).sort();
  });
}

it.each([
  { configName: "tsconfig.json", options: {}, javascript: false },
  { configName: "jsconfig.json", options: {}, javascript: true },
  { configName: "tsconfig.json", options: { allowJs: false }, javascript: false },
  { configName: "tsconfig.json", options: { allowJs: true }, javascript: true },
  { configName: "tsconfig.json", options: { checkJs: true }, javascript: true },
  { configName: "tsconfig.json", options: { allowJs: true, checkJs: false }, javascript: true },
  { configName: "tsconfig.json", options: { allowJs: false, checkJs: true }, javascript: false },
])(
  "agrees with TS6 and native TS7 config defaults ($configName, $options)",
  ({ configName, options, javascript }) => {
    const root = project();
    write(root, configName, {
      compilerOptions: options,
      include: ["src/**/*"],
      exclude: ["src/excluded/**"],
    });
    const files = [
      "src/a.ts",
      "src/b.js",
      "src/c.tsx",
      "src/d.jsx",
      "src/e.mts",
      "src/f.cts",
      "src/g.mjs",
      "src/h.cjs",
      "src/excluded/no.ts",
      "src/excluded/no.js",
      "other/no.ts",
    ];
    for (const file of files) write(root, file, "export const value = 1;");
    const included = files.filter(
      (file) =>
        file.startsWith("src/") &&
        !file.includes("excluded") &&
        (javascript || !/\.(?:js|jsx|mjs|cjs)$/.test(file)),
    );
    const expected = included
      .map((file) => path.join(root, file))
      .sort((a, b) => a.localeCompare(b));
    for (const actual of configFiles(path.join(root, configName))) expect(actual).toEqual(expected);
    for (const file of files)
      expect(getFileScopeDecision(file, root).status, file).toBe(
        included.includes(file) ? "included" : "excluded",
      );
  },
);

it("keeps inherited include/exclude paths correct for files created after the config was cached", () => {
  const root = project();
  write(root, "config/base.json", {
    compilerOptions: { allowJs: true },
    include: ["../src/**/*"],
    exclude: ["../src/excluded/**"],
  });
  write(root, "tsconfig.json", { extends: "./config/base.json" });
  write(root, "src/first.ts", "export const first = 1;");
  expect(getFileScopeDecision("src/first.ts", root).status).toBe("included");
  write(root, "src/late.js", "export const late = 1;");
  write(root, "src/excluded/no.ts", "export const no = 1;");
  for (const actual of configFiles(path.join(root, "tsconfig.json")))
    expect(actual).toEqual([path.join(root, "src/first.ts"), path.join(root, "src/late.js")]);
  expect(getFileScopeDecision("src/late.js", root).status).toBe("included");
  expect(getFileScopeDecision("src/excluded/no.ts", root).status).toBe("excluded");
});

it("treats referenced projects as separate config coverage rather than merged program membership", () => {
  const root = project();
  write(root, "tsconfig.json", { files: [], references: [{ path: "./app" }] });
  write(root, "app/tsconfig.json", {
    compilerOptions: { composite: true, allowJs: true, checkJs: true },
    include: ["src/**/*"],
    exclude: ["src/excluded/**"],
  });
  write(root, "app/src/a.ts", "export const a = 1;");
  write(root, "app/src/b.js", "export const b = 1;");
  write(root, "app/src/excluded/no.ts", "export const no = 1;");
  for (const actual of configFiles(path.join(root, "tsconfig.json"))) expect(actual).toEqual([]);
  for (const actual of configFiles(path.join(root, "app/tsconfig.json")))
    expect(actual).toEqual([path.join(root, "app/src/a.ts"), path.join(root, "app/src/b.js")]);
  expect(getFileScopeDecision("app/src/a.ts", root)).toMatchObject({
    status: "included",
    configPath: path.join(root, "app/tsconfig.json"),
  });
  expect(getFileScopeDecision("app/src/b.js", root).status).toBe("included");
  expect(getFileScopeDecision("app/src/excluded/no.ts", root).status).toBe("excluded");
});
