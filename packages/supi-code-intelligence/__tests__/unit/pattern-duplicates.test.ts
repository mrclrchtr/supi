import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeAction } from "../helpers/execute-action.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-pattern-duplicates-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// biome-ignore lint/suspicious/noSkippedTests: requires a registered tree-sitter provider
describe.skip("pattern duplicate reporting", () => {
  it("highlights duplicate definitions across files", async () => {
    const srcDir = path.join(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "a.ts"), "export const SPECIES_OPTIONS = ['oak'];\n");
    writeFileSync(path.join(srcDir, "b.ts"), "export const SPECIES_OPTIONS = ['pine'];\n");

    const result = await executeAction(
      { action: "find", query: "SPECIES_OPTIONS", kind: "definition", path: "src" },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("Duplicate Definitions");
    expect(result.content).toContain("SPECIES_OPTIONS");
    expect(result.content).toContain("defined in 2 files");
  });
});
