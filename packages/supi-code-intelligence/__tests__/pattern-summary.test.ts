import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { executePatternAction } from "../src/actions/pattern-action.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "pat-sum-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

it("returns summary when summary=true", async () => {
  writeFileSync(join(tmpDir, "a.ts"), "const foo = 1;\nconst foo = 2;");
  writeFileSync(join(tmpDir, "b.ts"), "const foo = 3;");
  writeFileSync(join(tmpDir, "c.ts"), "const bar = 4;");

  const result = await executePatternAction(
    { action: "pattern", pattern: "foo", summary: true },
    tmpDir,
  );
  expect(result).toContain("Pattern Summary");
  expect(result).toContain("2 files");
  expect(result).not.toContain("L1:");
});
