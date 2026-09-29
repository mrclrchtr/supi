import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { loadAutomaticExclusionPatterns } from "@mrclrchtr/supi-core/config";
import { afterEach, describe, expect, it } from "vitest";
import {
  AUTOMATIC_LSP_EXCLUDED_DIRECTORIES,
  createAutomaticLspPathPolicy,
  walkAutomaticLspTree,
} from "../../src/workspace-path-policy.ts";

const tempDirs: string[] = [];

function makeWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "supi-lsp-policy-"));
  tempDirs.push(root);
  return root;
}

function write(root: string, relativePath: string, content = "export {};\n"): string {
  const file = join(root, relativePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

afterEach(() => {
  for (const root of tempDirs.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("automatic LSP path policy", () => {
  it("excludes every built-in directory without excluding other dot-directories", () => {
    const root = makeWorkspace();
    const policy = createAutomaticLspPathPolicy(root, []);

    expect([...AUTOMATIC_LSP_EXCLUDED_DIRECTORIES].sort()).toEqual([
      ".cache",
      ".git",
      ".next",
      ".nuxt",
      ".pi",
      ".pnpm",
      ".turbo",
      "__pycache__",
      "build",
      "coverage",
      "dist",
      "node_modules",
      "out",
    ]);
    for (const directory of AUTOMATIC_LSP_EXCLUDED_DIRECTORIES) {
      const source = write(root, `${directory}/source.ts`);
      expect(policy.isEligible(source)).toBe(false);
      expect(policy.isEligible(dirname(source))).toBe(false);
    }
    expect(policy.isEligible(write(root, "src/build"))).toBe(true);
    expect(policy.isEligible(write(root, ".github/source.ts"))).toBe(true);
    expect(policy.isEligible(write(root, ".storybook/source.ts"))).toBe(true);
  });

  it("loads project and global code-intelligence exclusions before applying .pi exclusion", () => {
    const root = makeWorkspace();
    const home = makeWorkspace();
    write(
      root,
      ".pi/supi/config.json",
      JSON.stringify({ "code-intelligence": { exclude: ["project/"] } }),
    );
    write(
      home,
      ".pi/agent/supi/config.json",
      JSON.stringify({ "code-intelligence": { exclude: ["global/"] } }),
    );

    const projectPatterns = loadAutomaticExclusionPatterns(root, { homeDir: home });
    const projectPolicy = createAutomaticLspPathPolicy(root, projectPatterns);

    expect(projectPatterns).toEqual(["project/"]);
    expect(projectPolicy.isEligible(join(root, ".pi/supi/config.json"))).toBe(false);
    expect(projectPolicy.isEligible(write(root, "project/output.ts"))).toBe(false);

    rmSync(join(root, ".pi", "supi", "config.json"));
    const globalPatterns = loadAutomaticExclusionPatterns(root, { homeDir: home });
    const globalPolicy = createAutomaticLspPathPolicy(root, globalPatterns);

    expect(globalPatterns).toEqual(["global/"]);
    expect(globalPolicy.isEligible(write(root, "global/output.ts"))).toBe(false);
  });

  it("matches paths through a symbolic-link workspace root against canonical rules", () => {
    const root = makeWorkspace();
    const alias = join(dirname(root), `${basename(root)}-alias`);
    tempDirs.push(alias);
    symlinkSync(root, alias, "dir");
    write(root, ".gitignore", "ignored/\n");
    write(root, "visible.ts");
    write(root, "ignored/source.ts");
    const policy = createAutomaticLspPathPolicy(alias, []);

    expect(policy.workspaceRoot).toBe(realpathSync(root));
    expect(policy.isEligible(join(alias, "visible.ts"))).toBe(true);
    expect(policy.isEligible(join(alias, "ignored/source.ts"))).toBe(false);
  });

  it("rejects the removed lsp.exclude setting", () => {
    const root = makeWorkspace();
    write(root, ".pi/supi/config.json", JSON.stringify({ lsp: { exclude: ["fixtures/"] } }));

    expect(() => loadAutomaticExclusionPatterns(root)).toThrow('"lsp.exclude" was removed');
  });

  it("rejects an invalid code-intelligence exclusion list", () => {
    const root = makeWorkspace();
    write(
      root,
      ".pi/supi/config.json",
      JSON.stringify({ "code-intelligence": { exclude: ["valid/", 42] } }),
    );

    expect(() => loadAutomaticExclusionPatterns(root)).toThrow(
      "expected an array of gitignore-style strings",
    );
  });

  it("ignores a removed project exclusion when the project is untrusted", () => {
    const root = makeWorkspace();
    const home = makeWorkspace();
    write(root, ".pi/supi/config.json", JSON.stringify({ lsp: { exclude: ["fixtures/"] } }));

    expect(loadAutomaticExclusionPatterns(root, { homeDir: home, projectTrusted: false })).toEqual(
      [],
    );
  });

  it("replaces global patterns with a trusted project list and honors an empty clear", () => {
    const root = makeWorkspace();
    const home = makeWorkspace();
    write(root, ".pi/supi/config.json", JSON.stringify({ "code-intelligence": { exclude: [] } }));
    write(
      home,
      ".pi/agent/supi/config.json",
      JSON.stringify({ "code-intelligence": { exclude: ["global/"] } }),
    );

    expect(loadAutomaticExclusionPatterns(root, { homeDir: home })).toEqual([]);
    expect(loadAutomaticExclusionPatterns(root, { homeDir: home, projectTrusted: false })).toEqual([
      "global/",
    ]);
  });

  it("captures configured patterns in an immutable policy snapshot", () => {
    const root = makeWorkspace();
    const patterns = ["generated/"];
    const policy = createAutomaticLspPathPolicy(root, patterns);
    patterns[0] = "visible/";

    expect(policy.configuredPatterns).toEqual(["generated/"]);
    expect(Object.isFrozen(policy.configuredPatterns)).toBe(true);
    expect(policy.isConfiguredExcluded?.(join(root, "generated"), "directory")).toBe(true);
  });

  it("applies configured patterns in order with negation", () => {
    const root = makeWorkspace();
    const policy = createAutomaticLspPathPolicy(root, ["generated/**", "!generated/keep.ts"]);

    expect(policy.isEligible(write(root, "generated/drop.ts"))).toBe(false);
    expect(policy.isEligible(write(root, "generated/keep.ts"))).toBe(true);

    const builtInPolicy = createAutomaticLspPathPolicy(root, [
      "node_modules/**",
      "!node_modules/keep.ts",
    ]);
    expect(builtInPolicy.isEligible(write(root, "node_modules/keep.ts"))).toBe(false);
  });

  it("prunes an excluded starting directory", () => {
    const root = makeWorkspace();
    const excludedRoot = dirname(write(root, ".cache/source.ts"));
    const policy = createAutomaticLspPathPolicy(root, []);
    const visited: string[] = [];

    walkAutomaticLspTree(policy, excludedRoot, 3, (directory) => {
      visited.push(directory);
    });

    expect(visited).toEqual([]);
  });

  it("does not traverse symbolic-link directories and permits regular symbolic-link files", () => {
    const root = makeWorkspace();
    const external = makeWorkspace();
    write(root, "source.ts");
    write(external, "outside.ts");
    symlinkSync(external, join(root, "linked-directory"), "dir");
    symlinkSync(join(root, "source.ts"), join(root, "linked-file.ts"));
    const policy = createAutomaticLspPathPolicy(root, []);
    const visited: string[] = [];

    walkAutomaticLspTree(policy, root, 3, (directory, entries) => {
      visited.push(directory, ...entries.map((entry) => join(directory, entry.name)));
    });

    expect(lstatSync(join(root, "linked-directory")).isSymbolicLink()).toBe(true);
    expect(policy.isEligible(join(root, "linked-directory"), "directory")).toBe(false);
    expect(policy.isEligible(join(root, "linked-directory", "outside.ts"))).toBe(false);
    expect(policy.isEligible(join(root, "linked-file.ts"))).toBe(true);
    expect(visited).toContain(join(root, "linked-file.ts"));
    expect(visited).not.toContain(join(root, "linked-directory"));
    expect(visited).not.toContain(join(root, "linked-directory", "outside.ts"));
  });

  it("applies root and nested repository rules with directory-relative negation", () => {
    const root = makeWorkspace();
    write(root, ".gitignore", "*.generated.ts\nCase.ts\nignored/*\n!ignored/kept/\n");
    write(root, "packages/app/.gitignore", "drop.ts\n!keep.ts\n!.cache/allowed.ts\n");
    write(root, "packages/app/private/.gitignore", "cache/\n");
    const policy = createAutomaticLspPathPolicy(root, []);

    expect(policy.isEligible(write(root, "root.generated.ts"))).toBe(false);
    expect(policy.isEligible(write(root, "Case.ts"))).toBe(false);
    expect(policy.isEligible(write(root, "case.ts"))).toBe(true);
    expect(policy.isEligible(write(root, "ignored/drop/source.ts"))).toBe(false);
    expect(policy.isEligible(write(root, "ignored/kept/source.ts"))).toBe(true);
    expect(policy.isEligible(write(root, "packages/app/drop.ts"))).toBe(false);
    expect(policy.isEligible(write(root, "packages/app/keep.ts"))).toBe(true);
    expect(policy.isEligible(write(root, "packages/other/source.ts"))).toBe(true);
    expect(policy.isEligible(write(root, "packages/app/.cache/allowed.ts"))).toBe(false);
    expect(policy.isEligible(write(root, "packages/app/private/cache/source.ts"))).toBe(false);
  });
});
