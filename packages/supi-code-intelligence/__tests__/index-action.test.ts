import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeIndexAction } from "../src/actions/index-action.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "index-act-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(dir: string, file: string, content: string) {
  const full = join(dir, file);
  mkdirSync(full.split("/").slice(0, -1).join("/"), { recursive: true });
  writeFileSync(full, content);
}

describe("executeIndexAction", () => {
  it("returns factual project map", () => {
    writeFile(tmpDir, "package.json", "{}");
    writeFile(tmpDir, "src/app.ts", "export const app = 1;");
    writeFile(tmpDir, "src/lib/util.ts", "export const util = 2;");
    writeFile(tmpDir, "src/routes/home.tsx", "export default () => {};");
    writeFile(tmpDir, "docs/readme.md", "# Docs");
    writeFile(tmpDir, "scripts/build.sh", "#!/bin/sh\necho ok");

    const result = executeIndexAction(tmpDir);
    expect(result).toContain("# Project Map:");
    expect(result).toContain("TypeScript: 2");
    expect(result).toContain("TSX: 1");
    expect(result).toContain("src/ (3 files)");
    expect(result).toContain("docs/ (1 file)");
    expect(result).toContain("Landmark files");
    expect(result).toContain("package.json");
  });

  it("handles empty source directories", () => {
    writeFile(tmpDir, "readme.md", "# Hello");
    const result = executeIndexAction(tmpDir);
    expect(result).toContain("**Source files:** 1 total");
  });
});
