import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTreeSitterSession } from "../src/session/session.ts";

const SOURCE =
  'const marker = "😀"; import { dep } from "pkg"; export function target() { dep(); }\n';

describe("real-parser UTF-16 coordinates", () => {
  it("preserves JavaScript character positions across structural operations", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "tree-sitter-unicode-"));
    writeFileSync(path.join(tmpDir, "sample.ts"), SOURCE);
    const session = createTreeSitterSession(tmpDir);

    try {
      const node = await session.nodeAt("sample.ts", 1, 65);
      expect(node).toMatchObject({
        kind: "success",
        data: {
          type: "identifier",
          text: "target",
          range: { startCharacter: 65, endCharacter: 71 },
        },
      });

      const outline = await session.outline("sample.ts");
      expect(outline).toMatchObject({
        kind: "success",
        data: [
          { name: "marker" },
          {
            name: "target",
            range: { startCharacter: 56, endCharacter: 84 },
          },
        ],
      });

      const imports = await session.imports("sample.ts");
      expect(imports).toMatchObject({
        kind: "success",
        data: [
          {
            moduleSpecifier: "pkg",
            range: { startCharacter: 22, endCharacter: 48 },
          },
        ],
      });

      const exports = await session.exports("sample.ts");
      expect(exports).toMatchObject({
        kind: "success",
        data: [
          {
            name: "target",
            range: { startCharacter: 56, endCharacter: 84 },
          },
        ],
      });

      const callSites = await session.callSites("sample.ts");
      expect(callSites).toMatchObject({ kind: "success", data: [{ name: "dep", startLine: 1 }] });

      const callees = await session.calleesAt("sample.ts", 1, 65);
      expect(callees).toMatchObject({
        kind: "success",
        data: {
          enclosingScope: { name: "target" },
          callees: [
            {
              name: "dep",
              range: { startCharacter: 76, endCharacter: 79 },
            },
          ],
        },
      });
    } finally {
      session.dispose();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
