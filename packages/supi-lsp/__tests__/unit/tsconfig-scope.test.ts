import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearTsconfigCache,
  getFileScopeDecision,
  invalidateTsconfigCacheForConfig,
  invalidateTsconfigCacheForConfigDir,
  isFileExcludedByTsconfig,
} from "../../src/config/tsconfig-scope.ts";

// Use the repo root as cwd — this matches how LspManager passes this.cwd
const CWD = path.resolve(__dirname, "../../../../");

// biome-ignore lint/security/noSecrets: describe name, not a secret
describe("isFileExcludedByTsconfig", () => {
  afterEach(() => {
    clearTsconfigCache();
  });

  it("returns false for a file included by tsconfig", () => {
    // packages/supi-lsp/src/summary.ts is included by the package tsconfig (src/**/*.ts)
    expect(isFileExcludedByTsconfig("packages/supi-lsp/src/summary.ts", CWD)).toBe(false);
  });

  it("returns false for a file in __tests__ included by its own tsconfig", () => {
    // The __tests__/ directory has its own tsconfig that includes **/*.ts,
    // but the package tsconfig (one level up) excludes __tests__/. The nearest
    // tsconfig is __tests__/tsconfig.json which includes **/*.ts —
    // so test files ARE included by their own tsconfig.
    // This means they won't be filtered, which is correct: test files
    // should get LSP diagnostics.
    expect(isFileExcludedByTsconfig("packages/supi-lsp/__tests__/unit/config.test.ts", CWD)).toBe(
      false,
    );
  });

  it("returns true for a .tsx file not matching include patterns", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-lsp-tsx-"));
    try {
      fs.writeFileSync(path.join(tempRoot, "tsconfig.json"), '{"include":["**/*.ts"]}');
      fs.writeFileSync(path.join(tempRoot, "sample.tsx"), "export const sample = true;\n");

      // "sample.tsx" does NOT match "**/*.ts" → excluded
      expect(isFileExcludedByTsconfig("sample.tsx", tempRoot)).toBe(true);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("returns false for a test file that matches include **/*.ts", () => {
    // __tests__/tsconfig.json has include: ["**/*.ts"]
    expect(isFileExcludedByTsconfig("packages/supi-lsp/__tests__/unit/config.test.ts", CWD)).toBe(
      false,
    );
  });

  it("does not cache a miss from a different root", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-lsp-tsconfig-"));
    try {
      const projectRoot = path.join(tempRoot, "project");
      const childDir = path.join(projectRoot, "child");
      const otherRoot = path.join(tempRoot, "other-root");
      fs.mkdirSync(childDir, { recursive: true });
      fs.mkdirSync(otherRoot, { recursive: true });
      fs.writeFileSync(path.join(projectRoot, "tsconfig.json"), '{"include":["allowed.ts"]}');

      expect(isFileExcludedByTsconfig(path.join(projectRoot, "child/sample.ts"), otherRoot)).toBe(
        false,
      );
      expect(isFileExcludedByTsconfig("child/sample.ts", projectRoot)).toBe(true);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("treats non-recursive include patterns like TypeScript does", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-lsp-include-"));
    try {
      fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, "tsconfig.json"), '{"include":["*.ts"]}');
      fs.writeFileSync(path.join(tempRoot, "root.ts"), "export const root = true;\n");
      fs.writeFileSync(path.join(tempRoot, "src/nested.ts"), "export const nested = true;\n");

      expect(isFileExcludedByTsconfig("root.ts", tempRoot)).toBe(false);
      expect(isFileExcludedByTsconfig("src/nested.ts", tempRoot)).toBe(true);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("treats include: [] as including no files", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-lsp-empty-include-"));
    try {
      fs.writeFileSync(path.join(tempRoot, "tsconfig.json"), '{"include":[]}');
      fs.writeFileSync(path.join(tempRoot, "root.ts"), "export const root = true;\n");

      expect(isFileExcludedByTsconfig("root.ts", tempRoot)).toBe(true);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("follows extends chains when determining scope", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-lsp-extends-"));
    try {
      const projectRoot = path.join(tempRoot, "project");
      fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, "base.json"), '{"include":["project/src/**/*.ts"]}');
      fs.writeFileSync(path.join(projectRoot, "tsconfig.json"), '{"extends":"../base.json"}');
      fs.writeFileSync(path.join(projectRoot, "src/included.ts"), "export const ok = true;\n");
      fs.writeFileSync(path.join(projectRoot, "other.ts"), "export const other = true;\n");

      expect(isFileExcludedByTsconfig("src/included.ts", projectRoot)).toBe(false);
      expect(isFileExcludedByTsconfig("other.ts", projectRoot)).toBe(true);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("uses jsconfig.json when no tsconfig.json is present", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-lsp-jsconfig-"));
    try {
      fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, "jsconfig.json"), '{"include":["src/**/*.js"]}');
      fs.writeFileSync(path.join(tempRoot, "src/app.js"), "export const app = true;\n");
      fs.writeFileSync(path.join(tempRoot, "src/app.ts"), "export const app = true;\n");

      expect(isFileExcludedByTsconfig("src/app.js", tempRoot)).toBe(false);
      expect(isFileExcludedByTsconfig("src/app.ts", tempRoot)).toBe(true);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("includes a file created after the first config parse on a case-insensitive filesystem", () => {
    // Uppercase prefix guarantees a real case mismatch between the regex
    // pattern (built from the config dir) and the lowercased target path,
    // on any platform.
    // biome-ignore lint/security/noSecrets: temp dir prefix, not a secret
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "SupiLspPostParse-"));
    const originalCaseSensitivity = ts.sys.useCaseSensitiveFileNames;
    ts.sys.useCaseSensitiveFileNames = false;
    try {
      const projectRoot = path.join(tempRoot, "project");
      fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true });
      fs.writeFileSync(path.join(projectRoot, "tsconfig.json"), '{"include":["src/**/*.ts"]}');

      // Prime the cached parse while the file does not exist yet.
      fs.writeFileSync(path.join(projectRoot, "src/existing.ts"), "export const ok = true;\n");
      expect(isFileExcludedByTsconfig("src/existing.ts", projectRoot)).toBe(false);

      // The file is created after the parse was cached, so it is absent from
      // the cached fileNames set and must fall through to the include pattern.
      fs.writeFileSync(path.join(projectRoot, "src/late.ts"), "export const late = true;\n");
      expect(isFileExcludedByTsconfig("src/late.ts", projectRoot)).toBe(false);
    } finally {
      ts.sys.useCaseSensitiveFileNames = originalCaseSensitivity;
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("returns false for a file with no nearby tsconfig", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-lsp-no-config-"));
    try {
      expect(isFileExcludedByTsconfig("some-random-file.ts", tempRoot)).toBe(false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("getFileScopeDecision", () => {
  afterEach(() => {
    clearTsconfigCache();
  });

  it("reports basis fileNames for a parse-time file", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-scope-filenames-"));
    try {
      fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, "tsconfig.json"), '{"include":["src/**/*.ts"]}');
      fs.writeFileSync(path.join(tempRoot, "src/existing.ts"), "export const ok = true;\n");

      const decision = getFileScopeDecision("src/existing.ts", tempRoot);
      expect(decision.status).toBe("included");
      expect(decision.basis).toBe("fileNames");
      expect(decision.configPath).toBe(path.join(tempRoot, "tsconfig.json"));
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports basis include-pattern for a post-parse file", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-scope-postparse-"));
    try {
      fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, "tsconfig.json"), '{"include":["src/**/*.ts"]}');
      fs.writeFileSync(path.join(tempRoot, "src/existing.ts"), "export const ok = true;\n");
      // Prime the cached parse while the file does not exist yet.
      expect(getFileScopeDecision("src/existing.ts", tempRoot).status).toBe("included");
      fs.writeFileSync(path.join(tempRoot, "src/late.ts"), "export const late = true;\n");

      const decision = getFileScopeDecision("src/late.ts", tempRoot);
      expect(decision.status).toBe("included");
      expect(decision.basis).toBe("include-pattern");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports basis explicit for a files-array config", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-scope-explicit-"));
    try {
      fs.writeFileSync(
        path.join(tempRoot, "tsconfig.json"),
        '{"files":["src/a.ts"],"compilerOptions":{"allowJs":true}}',
      );
      fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, "src/a.ts"), "export const a = true;\n");
      fs.writeFileSync(path.join(tempRoot, "src/b.ts"), "export const b = true;\n");

      // The listed file is part of the parse-time file set.
      expect(getFileScopeDecision("src/a.ts", tempRoot)).toMatchObject({
        status: "included",
        basis: "fileNames",
      });
      // An unlisted file is excluded because it is not in the explicit list.
      expect(getFileScopeDecision("src/b.ts", tempRoot)).toMatchObject({
        status: "excluded",
        basis: "explicit",
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports basis exclude-pattern for an excluded file", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-scope-exclude-"));
    try {
      fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(tempRoot, "tsconfig.json"),
        '{"include":["src/**/*.ts"],"exclude":["src/generated/**"]}',
      );
      // Prime the cached parse before the post-parse files exist, so they
      // fall through to the include/exclude patterns instead of fileNames.
      fs.writeFileSync(path.join(tempRoot, "src/existing.ts"), "export const ok = true;\n");
      expect(getFileScopeDecision("src/existing.ts", tempRoot).status).toBe("included");
      fs.writeFileSync(path.join(tempRoot, "src/app.ts"), "export const app = true;\n");
      fs.mkdirSync(path.join(tempRoot, "src/generated"), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, "src/generated/gen.ts"), "export const gen = true;\n");

      expect(getFileScopeDecision("src/app.ts", tempRoot)).toMatchObject({
        status: "included",
        basis: "include-pattern",
      });
      expect(getFileScopeDecision("src/generated/gen.ts", tempRoot)).toMatchObject({
        status: "excluded",
        basis: "exclude-pattern",
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports basis extension for a non-included file type", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-scope-extension-"));
    try {
      fs.writeFileSync(path.join(tempRoot, "tsconfig.json"), '{"include":["**/*.ts"]}');
      fs.writeFileSync(path.join(tempRoot, "notes.md"), "# notes\n");

      expect(getFileScopeDecision("notes.md", tempRoot)).toMatchObject({
        status: "excluded",
        basis: "extension",
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports no-config when no project config exists", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-scope-noconfig-"));
    try {
      const decision = getFileScopeDecision("some-file.ts", tempRoot);
      expect(decision.status).toBe("no-config");
      expect(decision.basis).toBeNull();
      expect(decision.configPath).toBeNull();
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports out-of-tree for a file outside the project root", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-scope-oot-root-"));
    // A sibling directory at the same level as the project root: the file is
    // genuinely outside the project tree.
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-scope-oot-out-"));
    try {
      const outside = path.join(outsideRoot, "file.ts");
      fs.writeFileSync(outside, "export const x = true;\n");

      const decision = getFileScopeDecision(outside, tempRoot);
      expect(decision.status).toBe("out-of-tree");
      expect(decision.basis).toBeNull();
      expect(decision.configPath).toBeNull();
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it("keeps the case-sensitivity flag in the decision", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-scope-case-"));
    const original = ts.sys.useCaseSensitiveFileNames;
    try {
      ts.sys.useCaseSensitiveFileNames = false;
      expect(getFileScopeDecision("x.ts", tempRoot).caseSensitiveFileNames).toBe(false);
      ts.sys.useCaseSensitiveFileNames = true;
      expect(getFileScopeDecision("x.ts", tempRoot).caseSensitiveFileNames).toBe(true);
    } finally {
      ts.sys.useCaseSensitiveFileNames = original;
    }
  });
});

describe("targeted tsconfig cache invalidation", () => {
  afterEach(() => {
    clearTsconfigCache();
  });

  it("re-derives decisions after a config edit via targeted invalidation", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-invalid-config-"));
    try {
      fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, "tsconfig.json"), '{"include":["src/**/*.ts"]}');
      fs.writeFileSync(path.join(tempRoot, "src/app.ts"), "export const app = true;\n");
      fs.writeFileSync(path.join(tempRoot, "src/gen.ts"), "export const gen = true;\n");

      expect(getFileScopeDecision("src/gen.ts", tempRoot).status).toBe("included");

      // The config now excludes the generated directory, but the cached parse
      // still includes it until the cache is invalidated.
      fs.writeFileSync(
        path.join(tempRoot, "tsconfig.json"),
        '{"include":["src/**/*.ts"],"exclude":["src/gen.ts"]}',
      );
      expect(getFileScopeDecision("src/gen.ts", tempRoot).status).toBe("included");

      invalidateTsconfigCacheForConfig(path.join(tempRoot, "tsconfig.json"));
      expect(getFileScopeDecision("src/gen.ts", tempRoot).status).toBe("excluded");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("invalidates a cached root when a direct extended config changes", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-invalid-extends-direct-"));
    try {
      fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
      const rootConfig = path.join(tempRoot, "tsconfig.json");
      const baseConfig = path.join(tempRoot, "tsconfig.base.json");
      fs.writeFileSync(rootConfig, '{"extends":"./tsconfig.base.json"}');
      fs.writeFileSync(baseConfig, '{"include":["src/**/*.ts"]}');
      fs.writeFileSync(path.join(tempRoot, "src/app.ts"), "export const app = true;\n");

      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("included");

      fs.writeFileSync(baseConfig, '{"include":[]}');
      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("included");

      invalidateTsconfigCacheForConfig(baseConfig);
      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("excluded");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("invalidates a cached root when a transitive extended config changes", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-invalid-extends-transitive-"));
    try {
      fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
      const baseConfig = path.join(tempRoot, "tsconfig.base.json");
      fs.writeFileSync(
        path.join(tempRoot, "tsconfig.json"),
        '{"extends":"./tsconfig.shared.json"}',
      );
      fs.writeFileSync(
        path.join(tempRoot, "tsconfig.shared.json"),
        '{"extends":"./tsconfig.base.json"}',
      );
      fs.writeFileSync(baseConfig, '{"include":["src/**/*.ts"]}');
      fs.writeFileSync(path.join(tempRoot, "src/app.ts"), "export const app = true;\n");

      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("included");

      fs.writeFileSync(baseConfig, '{"include":[]}');
      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("included");

      invalidateTsconfigCacheForConfig(baseConfig);
      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("excluded");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("invalidates a cached root when a transitive extended config is deleted", () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "supi-invalid-extends-transitive-delete-"),
    );
    try {
      fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
      const baseConfig = path.join(tempRoot, "tsconfig.base.json");
      fs.writeFileSync(
        path.join(tempRoot, "tsconfig.json"),
        '{"extends":"./tsconfig.shared.json"}',
      );
      fs.writeFileSync(
        path.join(tempRoot, "tsconfig.shared.json"),
        '{"extends":"./tsconfig.base.json"}',
      );
      fs.writeFileSync(baseConfig, '{"include":[]}');
      fs.writeFileSync(path.join(tempRoot, "src/app.ts"), "export const app = true;\n");

      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("excluded");

      fs.rmSync(baseConfig);
      invalidateTsconfigCacheForConfig(baseConfig);
      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("included");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("invalidates a cached root when an entry in an extends array changes", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-invalid-extends-array-"));
    try {
      fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
      const baseConfig = path.join(tempRoot, "tsconfig.base.json");
      fs.writeFileSync(
        path.join(tempRoot, "tsconfig.json"),
        '{"extends":["./tsconfig.base.json","./tsconfig.extra.json"]}',
      );
      fs.writeFileSync(path.join(tempRoot, "tsconfig.extra.json"), "{}");
      fs.writeFileSync(baseConfig, '{"include":["src/**/*.ts"]}');
      fs.writeFileSync(path.join(tempRoot, "src/app.ts"), "export const app = true;\n");

      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("included");

      fs.writeFileSync(baseConfig, '{"include":[]}');
      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("included");

      invalidateTsconfigCacheForConfig(baseConfig);
      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("excluded");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("invalidates a cached root when an entry in an extends array is created", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-invalid-extends-array-create-"));
    try {
      fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
      const baseConfig = path.join(tempRoot, "tsconfig.base.json");
      fs.writeFileSync(
        path.join(tempRoot, "tsconfig.json"),
        '{"extends":["./tsconfig.base.json","./tsconfig.extra.json"]}',
      );
      fs.writeFileSync(path.join(tempRoot, "tsconfig.extra.json"), "{}");
      fs.writeFileSync(path.join(tempRoot, "src/app.ts"), "export const app = true;\n");

      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("included");

      fs.writeFileSync(baseConfig, '{"include":[]}');
      invalidateTsconfigCacheForConfig(baseConfig);
      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("excluded");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("invalidates a cached root when an extended config is created", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-invalid-extends-create-"));
    try {
      fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
      const baseConfig = path.join(tempRoot, "tsconfig.base.json");
      fs.writeFileSync(path.join(tempRoot, "tsconfig.json"), '{"extends":"./tsconfig.base.json"}');
      fs.writeFileSync(path.join(tempRoot, "src/app.ts"), "export const app = true;\n");

      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("included");

      fs.writeFileSync(baseConfig, '{"include":[]}');
      invalidateTsconfigCacheForConfig(baseConfig);
      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("excluded");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("invalidates a cached root when an extended config is deleted", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-invalid-extends-delete-"));
    try {
      fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
      const baseConfig = path.join(tempRoot, "tsconfig.base.json");
      fs.writeFileSync(path.join(tempRoot, "tsconfig.json"), '{"extends":"./tsconfig.base.json"}');
      fs.writeFileSync(baseConfig, '{"include":[]}');
      fs.writeFileSync(path.join(tempRoot, "src/app.ts"), "export const app = true;\n");

      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("excluded");

      fs.rmSync(baseConfig);
      invalidateTsconfigCacheForConfig(baseConfig);
      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("included");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("re-resolves dirs that previously had no config when a config is created", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-invalid-create-"));
    try {
      fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, "src/app.ts"), "export const app = true;\n");

      // No config: decisions are no-config.
      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("no-config");

      // Create a config that excludes the src directory; the cached no-config
      // lookup under src must be dropped for the new config to take effect.
      fs.writeFileSync(path.join(tempRoot, "tsconfig.json"), '{"include":["*.ts"]}');
      fs.writeFileSync(path.join(tempRoot, "ok.ts"), "export const ok = true;\n");

      invalidateTsconfigCacheForConfig(path.join(tempRoot, "tsconfig.json"));
      invalidateTsconfigCacheForConfigDir(tempRoot);

      expect(getFileScopeDecision("src/app.ts", tempRoot).status).toBe("excluded");
      expect(getFileScopeDecision("ok.ts", tempRoot).status).toBe("included");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("replaces a cached lower-priority config when a nested tsconfig is created", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-invalid-nested-create-"));
    try {
      const nestedRoot = path.join(tempRoot, "packages/app");
      fs.mkdirSync(path.join(nestedRoot, "src"), { recursive: true });
      fs.writeFileSync(path.join(nestedRoot, "jsconfig.json"), '{"include":["**/*.ts"]}');
      fs.writeFileSync(path.join(nestedRoot, "src/app.ts"), "export const app = true;\n");

      expect(getFileScopeDecision("packages/app/src/app.ts", tempRoot).status).toBe("included");

      const nestedConfig = path.join(nestedRoot, "tsconfig.json");
      fs.writeFileSync(nestedConfig, '{"include":["other/**/*.ts"]}');
      invalidateTsconfigCacheForConfig(nestedConfig);
      invalidateTsconfigCacheForConfigDir(nestedRoot);

      expect(getFileScopeDecision("packages/app/src/app.ts", tempRoot).status).toBe("excluded");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("keeps unrelated parsed configs intact after targeted invalidation", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-invalid-other-"));
    try {
      fs.mkdirSync(path.join(tempRoot, "a/src"), { recursive: true });
      fs.mkdirSync(path.join(tempRoot, "b/src"), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, "a/tsconfig.json"), '{"include":["src/**/*.ts"]}');
      fs.writeFileSync(path.join(tempRoot, "b/tsconfig.json"), '{"include":["src/**/*.ts"]}');
      fs.writeFileSync(path.join(tempRoot, "a/src/app.ts"), "export const app = true;\n");
      fs.writeFileSync(path.join(tempRoot, "b/src/app.ts"), "export const app = true;\n");

      expect(getFileScopeDecision("a/src/app.ts", tempRoot).status).toBe("included");
      expect(getFileScopeDecision("b/src/app.ts", tempRoot).status).toBe("included");

      // Invalidate only the a config; b keeps its cached parse even when the
      // b tsconfig is rewritten on disk.
      invalidateTsconfigCacheForConfig(path.join(tempRoot, "a/tsconfig.json"));
      fs.writeFileSync(
        path.join(tempRoot, "b/tsconfig.json"),
        '{"include":["src/**/*.ts"],"exclude":["src/app.ts"]}',
      );
      expect(getFileScopeDecision("b/src/app.ts", tempRoot).status).toBe("included");
      invalidateTsconfigCacheForConfig(path.join(tempRoot, "b/tsconfig.json"));
      expect(getFileScopeDecision("b/src/app.ts", tempRoot).status).toBe("excluded");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
