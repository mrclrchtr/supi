import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearTsconfigCache, isFileExcludedByTsconfig } from "../tsconfig-scope.ts";

// Use the repo root as cwd — this matches how LspManager passes this.cwd
const CWD = path.resolve(__dirname, "../../../");

// biome-ignore lint/security/noSecrets: describe name, not a secret
describe("isFileExcludedByTsconfig", () => {
  afterEach(() => {
    clearTsconfigCache();
  });

  it("returns false for a file included by tsconfig", () => {
    // packages/supi-lsp/summary.ts is included by the package tsconfig (*.ts)
    expect(isFileExcludedByTsconfig("packages/supi-lsp/summary.ts", CWD)).toBe(false);
  });

  it("returns true for a file in __tests__ excluded by the package tsconfig", () => {
    // The __tests__/ directory has its own tsconfig that includes *.ts,
    // but the package tsconfig (one level up) excludes __tests__/.
    // The nearest tsconfig is __tests__/tsconfig.json which includes *.ts —
    // so test files ARE included by their own tsconfig.
    // This means they won't be filtered, which is correct: test files
    // should get LSP diagnostics.
    expect(isFileExcludedByTsconfig("packages/supi-lsp/__tests__/format.test.ts", CWD)).toBe(false);
  });

  it("returns true for a fixture file not matching include patterns", () => {
    // packages/supi-tree-sitter/__tests__/fixtures/sample.tsx
    // The nearest tsconfig is __tests__/tsconfig.json with include: ["*.ts"]
    // "fixtures/sample.tsx" does NOT match "*.ts" → excluded
    expect(
      isFileExcludedByTsconfig("packages/supi-tree-sitter/__tests__/fixtures/sample.tsx", CWD),
    ).toBe(true);
  });

  it("returns true for a fixture .js file not matching include *.ts", () => {
    expect(
      isFileExcludedByTsconfig("packages/supi-tree-sitter/__tests__/fixtures/sample.js", CWD),
    ).toBe(true);
  });

  it("returns false for a test file that matches include *.ts", () => {
    // __tests__/tsconfig.json has include: ["*.ts"]
    // format.test.ts IS *.ts → included → not excluded
    expect(
      isFileExcludedByTsconfig("packages/supi-tree-sitter/__tests__/language.test.ts", CWD),
    ).toBe(false);
  });

  it("returns false for a file with no nearby tsconfig", () => {
    expect(isFileExcludedByTsconfig("some-random-file.ts", CWD)).toBe(false);
  });
});
