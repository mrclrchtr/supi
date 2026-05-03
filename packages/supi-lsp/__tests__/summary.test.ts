import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isInProjectTree, isProjectSource, shouldIgnoreLspPath } from "../src/summary.ts";
import { clearTsconfigCache } from "../src/tsconfig-scope.ts";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supi-summary-test-"));

  // Create a tsconfig that excludes the __tests__ directory
  fs.writeFileSync(
    path.join(tmpDir, "tsconfig.json"),
    JSON.stringify({
      include: ["src"],
      exclude: ["__tests__"],
    }),
  );

  // Create some files
  fs.mkdirSync(path.join(tmpDir, "src", "__tests__"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "node_modules", "lib"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "src", "app.ts"), "export const x = 1;");
  fs.writeFileSync(path.join(tmpDir, "src", "__tests__", "app.test.ts"), "test('x', () => {});");
  fs.writeFileSync(path.join(tmpDir, "node_modules", "lib", "index.ts"), "export const y = 2;");
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// biome-ignore lint/security/noSecrets: false positive on test describe names
describe("isInProjectTree", () => {
  it("returns true for in-project source files", () => {
    expect(isInProjectTree(path.join(tmpDir, "src", "app.ts"), tmpDir)).toBe(true);
  });

  it("returns true for tsconfig-excluded files that are still in the project tree", () => {
    expect(isInProjectTree(path.join(tmpDir, "src", "__tests__", "app.test.ts"), tmpDir)).toBe(
      true,
    );
  });

  it("returns false for node_modules", () => {
    expect(isInProjectTree(path.join(tmpDir, "node_modules", "lib", "index.ts"), tmpDir)).toBe(
      false,
    );
  });

  it("returns false for out-of-tree files", () => {
    expect(isInProjectTree("/other/project/file.ts", tmpDir)).toBe(false);
  });
});

describe("isProjectSource", () => {
  it("matches isInProjectTree (no tsconfig exclusion)", () => {
    // A tsconfig-excluded file should still be considered a project source
    // for formatting/navigation purposes
    expect(isProjectSource(path.join(tmpDir, "src", "__tests__", "app.test.ts"), tmpDir)).toBe(
      true,
    );
  });
});

// biome-ignore lint/security/noSecrets: false positive on test describe names
describe("shouldIgnoreLspPath", () => {
  beforeAll(() => {
    clearTsconfigCache();
  });

  it("returns true for tsconfig-excluded files", () => {
    expect(shouldIgnoreLspPath(path.join(tmpDir, "src", "__tests__", "app.test.ts"), tmpDir)).toBe(
      true,
    );
  });

  it("returns false for files in tsconfig include", () => {
    expect(shouldIgnoreLspPath(path.join(tmpDir, "src", "app.ts"), tmpDir)).toBe(false);
  });

  it("returns false for tracked out-of-tree files", () => {
    expect(shouldIgnoreLspPath("/other/project/file.ts", tmpDir)).toBe(false);
  });

  it("returns true for node_modules", () => {
    expect(shouldIgnoreLspPath(path.join(tmpDir, "node_modules", "lib", "index.ts"), tmpDir)).toBe(
      true,
    );
  });
});
