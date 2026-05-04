import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { executeAction } from "../src/tool-actions.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "integ-idx-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(dir: string, file: string, content: string) {
  const full = join(dir, file);
  mkdirSync(full.split("/").slice(0, -1).join("/"), { recursive: true });
  writeFileSync(full, content);
}

it("executes index action through dispatcher", async () => {
  writeFile(tmpDir, "package.json", "{}");
  writeFile(tmpDir, "src/main.ts", "export const x = 1;");

  const result = await executeAction({ action: "index" }, { cwd: tmpDir });
  expect(result).toContain("Project Map");
  expect(result).toContain("TypeScript: 1");
  expect(result).toContain("package.json");
});
