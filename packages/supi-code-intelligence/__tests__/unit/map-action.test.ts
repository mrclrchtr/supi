import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeBriefTool } from "../../src/tool/execute-brief.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "brief-enrich-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relativePath: string, content: string) {
  const fullPath = path.join(tmpDir, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
}

describe("directory brief enrichment", () => {
  it("includes extension breakdown and landmarks for workspace root module", async () => {
    writeFile("package.json", "{}");
    writeFile("src/app.ts", "export const app = 1;");
    writeFile("src/lib/util.ts", "export const util = 2;");
    writeFile("src/routes/home.tsx", "export default () => {};");
    writeFile("docs/readme.md", "# Docs");

    const result = await executeBriefTool({ path: "." }, { cwd: tmpDir });

    expect(result.content).toContain("TypeScript: 2");
    expect(result.content).toContain("TSX: 1");
    expect(result.content).toContain("Markdown: 1");
    expect(result.content).toContain("Landmark files");
    expect(result.content).toContain("package.json");
    expect(result.content).not.toContain("startHere");
  });

  it("includes extension breakdown for a nested package directory", async () => {
    writeFile("package.json", "{}");
    writeFile("packages/app/package.json", "{}");
    writeFile("packages/app/src/main.ts", "export default function main() {}");
    writeFile("packages/app/src/routes/home.ts", "export const home = 1;");

    const result = await executeBriefTool({ path: "packages/app" }, { cwd: tmpDir });

    expect(result.content).toContain("TypeScript: 2");
    expect(result.content).toContain("JSON: 1");
    expect(result.content).toContain("`src/` — 2 files");
    expect(result.content).toContain("Landmark files");
    expect(result.content).toContain("package.json");
  });

  it("includes extension breakdown for any nested directory", async () => {
    writeFile("package.json", "{}");
    writeFile("packages/app/src/main.ts", "export default function main() {}");
    writeFile("packages/app/src/lib/util.ts", "export const util = 1;");
    writeFile("packages/app/src/lib/more.ts", "export const more = 2;");

    const result = await executeBriefTool({ path: "packages/app/src" }, { cwd: tmpDir });

    expect(result.content).toContain("TypeScript: 3");
  });

  it("handles file paths gracefully", async () => {
    writeFile("src/index.ts", "export const x = 1;");

    const result = await executeBriefTool({ file: "src/index.ts" }, { cwd: tmpDir });

    expect(result.content).not.toContain("code_map");
    expect(result.content).toContain("index.ts");
  });
});
