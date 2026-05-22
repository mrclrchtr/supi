import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeMapTool } from "../../src/tool/execute-map.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-map-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relativePath: string, content: string) {
  const fullPath = path.join(tmpDir, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
}

describe("executeMapTool", () => {
  it("returns a factual repo map for the workspace root", async () => {
    writeFile("package.json", "{}");
    writeFile("src/app.ts", "export const app = 1;");
    writeFile("src/lib/util.ts", "export const util = 2;");
    writeFile("src/routes/home.tsx", "export default () => {};");
    writeFile("docs/readme.md", "# Docs");

    const result = await executeMapTool({}, { cwd: tmpDir });

    expect(result.content).toContain("# Code Map: .");
    expect(result.content).toContain("TypeScript: 2");
    expect(result.content).toContain("TSX: 1");
    expect(result.content).toContain("src/ (3 files)");
    expect(result.content).toContain("docs/ (1 file)");
    expect(result.content).toContain("Landmark files");
    expect(result.content).toContain("package.json");
    expect(result.content).not.toContain("startHere");
  });

  it("accepts a package directory path", async () => {
    writeFile("packages/app/package.json", "{}");
    writeFile("packages/app/src/main.ts", "export default function main() {}");
    writeFile("packages/app/src/routes/home.ts", "export const home = 1;");

    const result = await executeMapTool({ path: "packages/app" }, { cwd: tmpDir });

    expect(result.content).toContain("# Code Map: packages/app");
    expect(result.content).toContain("src/ (2 files)");
    expect(result.content).toContain("package.json");
  });

  it("accepts any nested directory path", async () => {
    writeFile("packages/app/src/main.ts", "export default function main() {}");
    writeFile("packages/app/src/lib/util.ts", "export const util = 1;");
    writeFile("packages/app/src/lib/more.ts", "export const more = 2;");

    const result = await executeMapTool({ path: "packages/app/src" }, { cwd: tmpDir });

    expect(result.content).toContain("# Code Map: packages/app/src");
    expect(result.content).toContain("lib/ (2 files)");
  });

  it("rejects file paths", async () => {
    writeFile("packages/app/package.json", "{}");

    const result = await executeMapTool({ path: "packages/app/package.json" }, { cwd: tmpDir });

    expect(result.content).toContain("**Error:** code_map requires a directory path");
    expect(result.details).toBeUndefined();
  });
});
