import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearTsconfigCache, isFileExcludedByTsconfig } from "../../src/config/tsconfig-scope.ts";

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
    expect(isFileExcludedByTsconfig("packages/supi-lsp/__tests__/unit/format.test.ts", CWD)).toBe(
      false,
    );
  });

  it("returns true for a fixture file not matching include patterns", () => {
    // packages/supi-lsp/__tests__/fixtures/sample.tsx
    // The nearest tsconfig is __tests__/tsconfig.json with include: ["**/*.ts"]
    // "fixtures/sample.tsx" does NOT match "**/*.ts" → excluded
    expect(isFileExcludedByTsconfig("packages/supi-lsp/__tests__/fixtures/sample.tsx", CWD)).toBe(
      true,
    );
  });

  it("returns true for a fixture .js file not matching include **/*.ts", () => {
    expect(isFileExcludedByTsconfig("packages/supi-lsp/__tests__/fixtures/sample.js", CWD)).toBe(
      true,
    );
  });

  it("returns false for a test file that matches include **/*.ts", () => {
    // __tests__/tsconfig.json has include: ["**/*.ts"]
    // unit/format.test.ts matches **/*.ts → included → not excluded
    expect(isFileExcludedByTsconfig("packages/supi-lsp/__tests__/unit/format.test.ts", CWD)).toBe(
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

  it("returns false for a file with no nearby tsconfig", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "supi-lsp-no-config-"));
    try {
      expect(isFileExcludedByTsconfig("some-random-file.ts", tempRoot)).toBe(false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
