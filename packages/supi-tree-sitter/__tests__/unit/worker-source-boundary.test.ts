import { globSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = resolve(import.meta.dirname, "../..");

describe("Structural Worker source boundary", () => {
  it("keeps every production web-tree-sitter import below src/worker", () => {
    const offenders = globSync("src/**/*.{ts,mjs}", { cwd: PACKAGE_ROOT })
      .filter((file) =>
        readFileSync(resolve(PACKAGE_ROOT, file), "utf8").includes('from "web-tree-sitter"'),
      )
      .filter((file) => !file.startsWith("src/worker/"));

    expect(offenders.map((file) => relative(PACKAGE_ROOT, resolve(PACKAGE_ROOT, file)))).toEqual(
      [],
    );
  });
});
