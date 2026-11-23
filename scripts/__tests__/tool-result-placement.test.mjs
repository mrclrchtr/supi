// docs/conventions/tool-architecture.md § Result module naming: in a package with `src/tool/`,
// result assembly lives under `src/tool/`. This check covers the file-name part of that rule; who
// builds `content` and `details` stays a review judgement.

import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGES = new URL("../../packages", import.meta.url).pathname;
const RESULT_FILE = /^(result|output|[\w-]+-result)\.ts$/;

function resultFilesOutsideTool(pkg) {
  const src = join(PACKAGES, pkg, "src");
  if (!existsSync(join(src, "tool"))) return [];
  return readdirSync(src, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && RESULT_FILE.test(entry.name))
    .map((entry) => relative(PACKAGES, join(entry.parentPath, entry.name)))
    .filter((path) => !path.startsWith(join(pkg, "src", "tool")));
}

describe("tool result placement", () => {
  it("keeps result modules under src/tool/ in packages that have tools", () => {
    const misplaced = readdirSync(PACKAGES).flatMap(resultFilesOutsideTool);
    expect(misplaced).toEqual([]);
  });
});
