import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTreeSitterSession } from "../src/api.ts";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "supi-java-anonymous-outline-"));
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("Java anonymous class outline", () => {
  it("includes fields in an enum constant's anonymous class", async () => {
    writeFileSync(
      join(cwd, "Choice.java"),
      "enum Choice { SPECIAL { int hidden; void run() { int local = 1; } }; abstract void run(); }",
    );
    const session = createTreeSitterSession(cwd);
    try {
      const result = await session.outline("Choice.java");
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(JSON.stringify(result.data)).toContain('"name":"hidden"');
      expect(JSON.stringify(result.data)).not.toContain('"name":"local"');
    } finally {
      await session.dispose();
    }
  });

  it("includes anonymous-class fields without indexing method locals", async () => {
    writeFileSync(
      join(cwd, "Host.java"),
      `class Host {
  Object value = new Object() {
    int hidden;
    void run() {}
  };
  void work() {
    int local = 1;
  }
}
`,
    );
    const session = createTreeSitterSession(cwd);

    try {
      const result = await session.outline("Host.java");
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;

      const host = result.data.find(({ name }) => name === "Host");
      expect(host?.children?.map(({ name }) => name)).toEqual(["value", "hidden", "run", "work"]);
      expect(JSON.stringify(host?.children)).not.toContain("local");
    } finally {
      await session.dispose();
    }
  });
});
