import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearTsconfigCache } from "../../src/config/tsconfig-scope.ts";
import { isInProjectTree, isProjectSource, shouldIgnoreLspPath } from "../../src/summary.ts";
import { createAutomaticLspPathPolicy } from "../../src/workspace-path-policy.ts";

let tmpDir: string;
let policy: ReturnType<typeof createAutomaticLspPathPolicy>;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supi-summary-test-"));

  // Create a tsconfig that excludes the nested src/__tests__ directory
  fs.writeFileSync(
    path.join(tmpDir, "tsconfig.json"),
    JSON.stringify({
      include: ["src"],
      exclude: ["src/__tests__"],
    }),
  );

  // Create some files
  fs.mkdirSync(path.join(tmpDir, "src", "__tests__"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "node_modules", "lib"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "src", "app.ts"), "export const x = 1;");
  fs.writeFileSync(path.join(tmpDir, "src", "__tests__", "app.test.ts"), "test('x', () => {});");
  fs.writeFileSync(path.join(tmpDir, "node_modules", "lib", "index.ts"), "export const y = 2;");
  policy = createAutomaticLspPathPolicy(tmpDir, []);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// biome-ignore lint/security/noSecrets: false positive on test describe names
describe("isInProjectTree", () => {
  it("returns true for in-project source files", () => {
    expect(isInProjectTree(path.join(tmpDir, "src", "app.ts"), policy)).toBe(true);
  });

  it("returns true for tsconfig-excluded files that are still in the project tree", () => {
    expect(isInProjectTree(path.join(tmpDir, "src", "__tests__", "app.test.ts"), policy)).toBe(
      true,
    );
  });

  it("returns false for node_modules", () => {
    expect(isInProjectTree(path.join(tmpDir, "node_modules", "lib", "index.ts"), policy)).toBe(
      false,
    );
  });

  it("returns false for out-of-tree files", () => {
    expect(isInProjectTree("/other/project/file.ts", policy)).toBe(false);
  });
});

describe("isProjectSource", () => {
  it("matches isInProjectTree (no tsconfig exclusion)", () => {
    // A tsconfig-excluded file should still be considered a project source
    // for formatting/navigation purposes
    expect(isProjectSource(path.join(tmpDir, "src", "__tests__", "app.test.ts"), policy)).toBe(
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
    expect(
      shouldIgnoreLspPath(path.join(tmpDir, "src", "__tests__", "app.test.ts"), tmpDir, policy),
    ).toBe(true);
  });

  it("returns false for files in tsconfig include", () => {
    expect(shouldIgnoreLspPath(path.join(tmpDir, "src", "app.ts"), tmpDir, policy)).toBe(false);
  });

  it("returns true for out-of-tree files (outside project root)", () => {
    expect(shouldIgnoreLspPath("/other/project/file.ts", tmpDir, policy)).toBe(true);
  });

  it("returns true for node_modules", () => {
    expect(
      shouldIgnoreLspPath(path.join(tmpDir, "node_modules", "lib", "index.ts"), tmpDir, policy),
    ).toBe(true);
  });
});
