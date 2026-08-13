import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTreeSitterSession } from "../src/session/session.ts";

const FIXTURE_DIR = path.resolve(import.meta.dirname, "fixtures");

describe("createTreeSitterSession", () => {
  it("runs all structural operations through the owned Worker", async () => {
    const session = createTreeSitterSession(FIXTURE_DIR);
    try {
      await expect(session.canParse("sample.ts")).resolves.toEqual({
        kind: "success",
        data: { file: path.join(FIXTURE_DIR, "sample.ts"), language: "typescript" },
      });
      await expect(
        session.query("sample.ts", "(function_declaration name: (identifier) @name)"),
      ).resolves.toEqual({
        kind: "success",
        data: [expect.objectContaining({ name: "name", nodeType: "identifier", text: "hello" })],
      });
      await expect(session.outline("sample.ts")).resolves.toEqual({
        kind: "success",
        data: expect.arrayContaining([expect.objectContaining({ name: "hello" })]),
      });
      await expect(session.imports("sample.ts")).resolves.toEqual({
        kind: "success",
        data: expect.arrayContaining([
          expect.objectContaining({ moduleSpecifier: "node:fs/promises" }),
        ]),
      });
      await expect(session.exports("sample.ts")).resolves.toEqual({
        kind: "success",
        data: expect.arrayContaining([expect.objectContaining({ name: "hello" })]),
      });
      await expect(session.nodeAt("sample.ts", 1, 17)).resolves.toEqual({
        kind: "success",
        data: expect.objectContaining({ type: "identifier", text: "hello" }),
      });
      await expect(session.calleesAt("sample.ts", 1, 17)).resolves.toEqual({
        kind: "success",
        data: expect.objectContaining({ depth: "direct" }),
      });
      await expect(session.callSites("sample.ts")).resolves.toEqual({
        kind: "success",
        data: expect.any(Array),
      });
    } finally {
      await session.dispose();
    }
  });

  it("awaits disposal and rejects later admission", async () => {
    const session = createTreeSitterSession(FIXTURE_DIR);
    await session.canParse("sample.ts");
    await session.dispose();

    await expect(session.canParse("sample.ts")).resolves.toEqual({
      kind: "runtime-error",
      message: "Structural Worker is shut down",
    });
  });
});
