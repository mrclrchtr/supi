import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearTsconfigCache } from "../../src/config/tsconfig-scope.ts";
import {
  discoverTypeScriptProjectConfigs,
  findUnloadedTypeScriptProjects,
} from "../../src/manager/manager-typescript-coverage.ts";
import { createAutomaticLspPathPolicy } from "../../src/workspace-path-policy.ts";

const roots: string[] = [];
afterEach(() => {
  clearTsconfigCache();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function write(root: string, file: string, content: unknown): string {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof content === "string" ? content : JSON.stringify(content));
  return target;
}

/** Monorepo shape: a root base config extended by a package and its test project. */
function monorepo(): { root: string; source: string; testFile: string } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ts-coverage-")));
  roots.push(root);
  // No include: the base config's default include spans the whole tree.
  write(root, "tsconfig.json", { compilerOptions: { strict: true } });
  write(root, "pkg/tsconfig.json", { extends: "../tsconfig.json", include: ["src/**/*.ts"] });
  write(root, "pkg/__tests__/tsconfig.json", {
    extends: "../../tsconfig.json",
    include: ["**/*.ts", "../src/**/*.ts"],
  });
  const source = write(root, "pkg/src/value.ts", "export const value = 1;\n");
  const testFile = write(root, "pkg/__tests__/value.test.ts", "export const t = 1;\n");
  return { root, source, testFile };
}

function unloaded(root: string, file: string, openFiles: string[]): string[] {
  const configs = discoverTypeScriptProjectConfigs(root, createAutomaticLspPathPolicy(root, []));
  return findUnloadedTypeScriptProjects({ file, cwd: root, openFiles, configs }).map((config) =>
    path.relative(root, config),
  );
}

// biome-ignore lint/security/noSecrets: describe name, not a secret
describe("findUnloadedTypeScriptProjects", () => {
  it("reports an including test project without open files, but not an extended base config", () => {
    const { root, source } = monorepo();
    expect(unloaded(root, source, [source])).toEqual([
      path.join("pkg", "__tests__", "tsconfig.json"),
    ]);
  });

  it("reports nothing once a file from the including project is open", () => {
    const { root, source, testFile } = monorepo();
    expect(unloaded(root, source, [source, testFile])).toEqual([]);
  });
});
