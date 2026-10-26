import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTreeSitterSession } from "../src/api.ts";

describe("TypeScript syntax completeness", () => {
  it.each(["ts", "tsx"])(
    "inspects a type-only star re-export in %s without recovery",
    async (extension) => {
      const cwd = mkdtempSync(join(tmpdir(), "supi-typescript-syntax-"));
      const file = `index.${extension}`;
      writeFileSync(join(cwd, file), 'export type * from "./api.ts";\n');
      const session = createTreeSitterSession(cwd);
      try {
        const result = await session.nodeAt(file, 1, 8);
        expect(result.kind).toBe("success");
        if (result.kind !== "success") return;
        expect(result.data.text).toBe("type");
      } finally {
        await session.dispose();
        rmSync(cwd, { recursive: true, force: true });
      }
    },
  );

  it.each(["ts", "tsx"])(
    "retains an import-type array in %s as a complete type",
    async (extension) => {
      const cwd = mkdtempSync(join(tmpdir(), "supi-typescript-syntax-"));
      const file = `entries.${extension}`;
      writeFileSync(join(cwd, file), 'let entries: import("node:fs").Dirent[];\n');
      const session = createTreeSitterSession(cwd);
      try {
        const result = await session.query(file, "(array_type) @array");
        expect(result.kind).toBe("success");
        if (result.kind !== "success") return;
        expect(result.data).toEqual([
          expect.objectContaining({ nodeType: "array_type", text: 'import("node:fs").Dirent[]' }),
        ]);
      } finally {
        await session.dispose();
        rmSync(cwd, { recursive: true, force: true });
      }
    },
  );

  it("still reports a type-only star re-export with its required source missing", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "supi-typescript-syntax-"));
    writeFileSync(join(cwd, "broken.ts"), "export type *;\n");
    const session = createTreeSitterSession(cwd);
    try {
      const result = await session.nodeAt("broken.ts", 1, 8);
      expect(result.kind).toBe("partial");
      if (result.kind !== "partial") return;
      expect(result.errorRanges.length).toBeGreaterThan(0);
    } finally {
      await session.dispose();
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
