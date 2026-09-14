import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTreeSitterSession } from "../src/session/session.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "supi-callee-display-name-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("TreeSitterSession.calleesAt display names", () => {
  it("shortens callback receivers without changing names, sites, or syntax suffixes", async () => {
    const interpolationStart = "$" + "{";
    const nameTemplate = `\`${interpolationStart}c.name}\``;
    const itemTemplate = `\`${interpolationStart}item.id}\``;
    const source = [
      "function run() {",
      `  const byName = candidates.map((c) => ${nameTemplate}).join("");`,
      `  const byId = candidates.map((item) => ${itemTemplate}).join("");`,
      `  const computed = candidates.map((c) => ${nameTemplate})["join"]("");`,
      "  const empty = factory()();",
      "}",
    ].join("\n");
    writeFileSync(path.join(tmpDir, "sample.ts"), source, "utf-8");

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("sample.ts", 1, 10, { depth: "deep" });

      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;

      const chained = result.data.callees.filter(({ name }) => name.endsWith(".join"));
      expect(chained).toHaveLength(2);
      expect(chained.map(({ name }) => name)).toEqual([
        `candidates.map((c) => ${nameTemplate}).join`,
        `candidates.map((item) => ${itemTemplate}).join`,
      ]);
      expect(chained.map(({ displayName }) => displayName)).toEqual([
        "candidates.map(…).join",
        "candidates.map(…).join",
      ]);
      expect(chained.map(({ range }) => range.startLine)).toEqual([2, 3]);
      expect(chained.map(({ range }) => range.startCharacter)).toEqual(
        source
          .split("\n")
          .slice(1, 3)
          .map((line) => line.indexOf("candidates") + 1),
      );

      expect(result.data.callees).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: `candidates.map((c) => ${nameTemplate})["join"]`,
            // biome-ignore lint/security/noSecrets: This is a source-syntax label, not a secret.
            displayName: 'candidates.map(…)["join"]',
            range: expect.objectContaining({ startLine: 4 }),
          }),
          expect.objectContaining({
            name: "factory()",
            displayName: "factory()",
            range: expect.objectContaining({ startLine: 5 }),
          }),
        ]),
      );
    } finally {
      await session.dispose();
    }
  });
});
