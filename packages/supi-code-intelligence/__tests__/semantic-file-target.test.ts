import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeAction } from "../src/tool-actions.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-file-target-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeJson(dir: string, file: string, data: unknown) {
  writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}

describe("file-level semantic targets", () => {
  it("expands file-only callers requests across exported symbols", async () => {
    writeJson(tmpDir, "package.json", { name: "test-proj" });
    writeFileSync(
      path.join(tmpDir, "index.ts"),
      ["export const foo = 1;", "export function bar() {", "  return foo;", "}"].join("\n"),
    );
    writeFileSync(
      path.join(tmpDir, "consumer.ts"),
      ['import { foo, bar } from "./index";', "console.log(foo);", "bar();"].join("\n"),
    );

    const result = await executeAction({ action: "callers", file: "index.ts" }, { cwd: tmpDir });

    expect(result.content).toContain("Callers in `index.ts`");
    expect(result.content).toContain("`foo`");
    expect(result.content).toContain("`bar`");
    expect(result.content).toContain("consumer.ts");
    expect(result.content).not.toContain("require `line` and `character`");
    expect(result.details?.type).toBe("search");
  });

  it("expands file-only affected requests across exported symbols", async () => {
    writeJson(tmpDir, "package.json", { name: "test-proj" });
    writeFileSync(
      path.join(tmpDir, "index.ts"),
      ["export const foo = 1;", "export function bar() {", "  return foo;", "}"].join("\n"),
    );
    writeFileSync(
      path.join(tmpDir, "consumer.ts"),
      ['import { foo, bar } from "./index";', "console.log(foo);", "bar();"].join("\n"),
    );

    const result = await executeAction({ action: "affected", file: "index.ts" }, { cwd: tmpDir });

    expect(result.content).toContain("Affected: `index.ts`");
    expect(result.content).toContain("`foo`");
    expect(result.content).toContain("`bar`");
    expect(result.content).toContain("consumer.ts");
    expect(result.content).not.toContain("require `line` and `character`");
    expect(result.details?.type).toBe("affected");
  });

  it("returns an explicit unsupported message when file-level target discovery is unavailable", async () => {
    writeJson(tmpDir, "package.json", { name: "test-proj" });
    writeFileSync(path.join(tmpDir, "internal.py"), "def helper():\n    return 1\n");

    const result = await executeAction({ action: "callers", file: "internal.py" }, { cwd: tmpDir });

    expect(result.content).toContain("File-level semantic exploration is not available");
    expect(result.content).toContain("Provide `line` and `character`");
  });

  it("reports precise omitted counts for file-level affected results", async () => {
    writeJson(tmpDir, "package.json", { name: "test-proj" });
    writeFileSync(path.join(tmpDir, "index.ts"), "export const foo = 1;\n");
    writeFileSync(path.join(tmpDir, "a.ts"), 'import { foo } from "./index";\nconsole.log(foo);\n');
    writeFileSync(path.join(tmpDir, "b.ts"), 'import { foo } from "./index";\nconsole.log(foo);\n');
    writeFileSync(path.join(tmpDir, "c.ts"), 'import { foo } from "./index";\nconsole.log(foo);\n');

    const result = await executeAction(
      { action: "affected", file: "index.ts", maxResults: 1 },
      { cwd: tmpDir },
    );

    expect(result.details?.type).toBe("affected");
    if (result.details?.type === "affected") {
      expect(result.details.data.omittedCount).toBe(2);
    }
  });
});
