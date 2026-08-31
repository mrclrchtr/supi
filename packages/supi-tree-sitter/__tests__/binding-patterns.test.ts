import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTreeSitterSession } from "../src/session/session.ts";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "supi-binding-patterns-"));
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("JavaScript and TypeScript binding patterns", () => {
  it("emits every bound identifier from nested object and array patterns", async () => {
    writeFileSync(
      join(cwd, "patterns.ts"),
      [
        "const { first, second: alias, nested: { third }, withDefault = 1, ...rest } = source;",
        "export const [head, , tail = 2, ...remaining] = values;",
        "declare const { declared, nested: renamed } : Source;",
        "export declare const [exported, ...restExported]: Source;",
      ].join("\n"),
    );
    const session = createTreeSitterSession(cwd);

    try {
      const outline = await session.outline("patterns.ts");
      expect(outline).toMatchObject({ kind: "success" });
      if (outline.kind !== "success") return;
      expect(outline.data.map(({ name }) => name)).toEqual([
        "first",
        "alias",
        "third",
        "withDefault",
        "rest",
        "head",
        "tail",
        "remaining",
        "declared",
        "renamed",
        "exported",
        "restExported",
      ]);

      const exports = await session.exports("patterns.ts");
      expect(exports).toMatchObject({ kind: "success" });
      if (exports.kind !== "success") return;
      expect(exports.data.map(({ name }) => name)).toEqual([
        "head",
        "tail",
        "remaining",
        "exported",
        "restExported",
      ]);
    } finally {
      await session.dispose();
    }
  });
});
