import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { shouldBypassRtkRewrite } from "../src/guards.ts";

let tempDirs: string[] = [];

function makeProject(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "supi-rtk-guards-"));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

describe("rtk rewrite guards", () => {
  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  it("bypasses direct and package-manager Biome invocations", () => {
    const cwd = makeProject();

    expect(shouldBypassRtkRewrite("biome check .", cwd)).toBe(true);
    expect(shouldBypassRtkRewrite("./node_modules/.bin/biome check .", cwd)).toBe(true);
    expect(shouldBypassRtkRewrite("pnpm exec biome check .", cwd)).toBe(true);
    expect(shouldBypassRtkRewrite("pnpm exec -- biome check .", cwd)).toBe(true);
    expect(shouldBypassRtkRewrite("pnpm biome check .", cwd)).toBe(true);
    expect(shouldBypassRtkRewrite("pnpm run biome", cwd)).toBe(true);
  });

  it("bypasses package lint scripts only when the project uses Biome", () => {
    const biomeConfigProject = makeProject({ "biome.jsonc": "{}" });
    const biomeScriptProject = makeProject({
      "package.json": JSON.stringify({ scripts: { lint: "biome check ." } }),
    });
    const eslintProject = makeProject({
      "package.json": JSON.stringify({ scripts: { lint: "eslint ." } }),
    });

    expect(shouldBypassRtkRewrite("pnpm lint", biomeConfigProject)).toBe(true);
    expect(shouldBypassRtkRewrite("npm run lint", biomeScriptProject)).toBe(true);
    expect(shouldBypassRtkRewrite("pnpm lint", eslintProject)).toBe(false);
  });

  it("bypasses ripgrep invocations (rg → grep rewrite is lossy)", () => {
    const cwd = makeProject();

    expect(shouldBypassRtkRewrite("rg -l 'pattern' src/ -g '*.ts'", cwd)).toBe(true);
    expect(shouldBypassRtkRewrite("rg -n -U 'regex' file", cwd)).toBe(true);
    expect(shouldBypassRtkRewrite("rg --glob '*.test.ts' 'test' src/", cwd)).toBe(true);
    expect(shouldBypassRtkRewrite("rg 'hello' .", cwd)).toBe(true);
  });

  it("bypasses explicit RTK_DISABLED prefixes", () => {
    const cwd = makeProject();

    expect(shouldBypassRtkRewrite("RTK_DISABLED=1 pnpm exec biome check .", cwd)).toBe(true);
    expect(shouldBypassRtkRewrite("env RTK_DISABLED=1 git status", cwd)).toBe(true);
  });

  it("bypasses Biome commands wrapped in cd prefix", () => {
    const cwd = makeProject();

    expect(shouldBypassRtkRewrite("cd /Users/test/project && pnpm biome check src/", cwd)).toBe(
      true,
    );
    expect(shouldBypassRtkRewrite("cd /Users/test/project && npx --no biome check .", cwd)).toBe(
      true,
    );
    expect(shouldBypassRtkRewrite("cd /Users/test/project; pnpm exec biome check .", cwd)).toBe(
      true,
    );
    expect(
      shouldBypassRtkRewrite(
        "cd /Users/test/project && pnpm biome check --max-diagnostics=5 packages/supi-claude-md/ 2>&1",
        cwd,
      ),
    ).toBe(true);
  });

  it("does not bypass non-biome commands", () => {
    const cwd = makeProject();

    expect(shouldBypassRtkRewrite("cd /Users/test/project && pnpm lint", cwd)).toBe(false);
    expect(shouldBypassRtkRewrite("cd /Users/test/project && echo hello", cwd)).toBe(false);
    expect(shouldBypassRtkRewrite("cd /Users/test/project && git status", cwd)).toBe(false);
  });
});
