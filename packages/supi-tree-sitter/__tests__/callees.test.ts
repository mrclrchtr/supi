import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTreeSitterSession } from "../src/session/session.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "supi-callees-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeSource(fileName: string, source: string): string {
  const filePath = path.join(tmpDir, fileName);
  writeFileSync(filePath, source, "utf-8");
  return fileName;
}

describe("TreeSitterSession.calleesAt", () => {
  it("returns validation-error for invalid coordinates", async () => {
    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("test.ts", 0, 5);
      expect(result.kind).toBe("validation-error");
    } finally {
      await session.dispose();
    }
  });

  it("returns validation-error for coordinates beyond the source bounds", async () => {
    writeSource("bounds.ts", "function run() { dependency(); }\n");
    const session = createTreeSitterSession(tmpDir);
    try {
      const lineResult = await session.calleesAt("bounds.ts", 3, 1);
      const characterResult = await session.calleesAt("bounds.ts", 1, 999);
      expect(lineResult.kind).toBe("validation-error");
      expect(characterResult.kind).toBe("validation-error");
    } finally {
      await session.dispose();
    }
  });

  it("returns unsupported-language for HTML and SQL files", async () => {
    writeSource("test.html", "<html><body><p>hello</p></body></html>");
    writeSource("test.sql", "SELECT * FROM users WHERE id = 1;");
    const session = createTreeSitterSession(tmpDir);
    try {
      await expect(session.calleesAt("test.html", 1, 5)).resolves.toMatchObject({
        kind: "unsupported-language",
      });
      await expect(session.calleesAt("test.sql", 1, 5)).resolves.toMatchObject({
        kind: "unsupported-language",
      });
    } finally {
      await session.dispose();
    }
  });
});

describe("calleesAt — structural callee detection", () => {
  it("detects callees in a TypeScript function", async () => {
    writeSource(
      "test.ts",
      [
        "export function myFunction() {",
        "  doSomething();",
        // biome-ignore lint/security/noSecrets: test fixture code
        "  doSomethingElse(42);",
        "  return 0;",
        "}",
      ].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("test.ts", 1, 22);
      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data.enclosingScope.name).toBe("myFunction");
        expect(result.data.callees).toHaveLength(2);
        expect(result.data.callees[0].name).toContain("doSomething");
        expect(result.data.callees[1].name).toContain("doSomethingElse");
      }
    } finally {
      await session.dispose();
    }
  });

  it("keeps a long source-shape callee name", async () => {
    const callee = `root.${"longNamespaceSegment.".repeat(4)}finalCall`;
    writeSource("long-name.ts", `function run() { ${callee}(); }\n`);

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("long-name.ts", 1, 10);
      expect(result).toMatchObject({
        kind: "success",
        data: { callees: [{ name: callee }] },
      });
    } finally {
      await session.dispose();
    }
  });

  it("preserves repeated callee names at distinct source ranges", async () => {
    writeSource(
      "repeated.ts",
      ["function run() {", "  repeat(); repeat();", "  repeat();", "}"].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("repeated.ts", 1, 10);
      expect(result).toMatchObject({
        kind: "success",
        data: {
          callees: [
            {
              name: "repeat",
              range: { startLine: 2, startCharacter: 3, endLine: 2, endCharacter: 9 },
            },
            {
              name: "repeat",
              range: { startLine: 2, startCharacter: 13, endLine: 2, endCharacter: 19 },
            },
            {
              name: "repeat",
              range: { startLine: 3, startCharacter: 3, endLine: 3, endCharacter: 9 },
            },
          ],
        },
      });
    } finally {
      await session.dispose();
    }
  });

  it("preserves repeated names in direct and deep nested calls", async () => {
    writeSource(
      "nested-repeated.ts",
      [
        "function outer() {",
        "  repeat();",
        "  const callback = () => {",
        "    repeat();",
        "    repeat();",
        "  };",
        "  repeat();",
        "}",
      ].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const direct = await session.calleesAt("nested-repeated.ts", 1, 10, { depth: "direct" });
      expect(direct).toMatchObject({
        kind: "success",
        data: {
          callees: [
            { name: "repeat", range: { startLine: 2 } },
            { name: "repeat", range: { startLine: 7 } },
          ],
        },
      });

      const deep = await session.calleesAt("nested-repeated.ts", 1, 10, { depth: "deep" });
      expect(deep).toMatchObject({
        kind: "success",
        data: {
          callees: [
            { name: "repeat", range: { startLine: 2 } },
            { name: "repeat", range: { startLine: 4 } },
            { name: "repeat", range: { startLine: 5 } },
            { name: "repeat", range: { startLine: 7 } },
          ],
        },
      });
    } finally {
      await session.dispose();
    }
  });

  it("keeps chained calls with the same start and distinct full ranges", async () => {
    writeSource("chained.ts", ["function run() {", "  factory()();", "}"].join("\n"));

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("chained.ts", 1, 10);
      expect(result).toMatchObject({
        kind: "success",
        data: {
          callees: [
            {
              name: "factory",
              range: { startLine: 2, startCharacter: 3, endLine: 2, endCharacter: 10 },
            },
            {
              name: "factory()",
              range: { startLine: 2, startCharacter: 3, endLine: 2, endCharacter: 12 },
            },
          ],
        },
      });
    } finally {
      await session.dispose();
    }
  });

  it("detects callees in a Python function", async () => {
    writeSource(
      "test.py",
      ["def my_function():", "    process_data()", "    save_result(42)"].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("test.py", 1, 10);
      expect(result.kind).toBe("success");
      if (result.kind === "success") expect(result.data.callees).toHaveLength(2);
    } finally {
      await session.dispose();
    }
  });

  it("detects callees in a Rust function", async () => {
    writeSource(
      "test.rs",
      ["fn my_function() {", "    compute_value();", "    let x = 42;", "}"].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("test.rs", 1, 5);
      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data.callees.length).toBeGreaterThanOrEqual(1);
        expect(result.data.callees[0].name).toContain("compute_value");
      }
    } finally {
      await session.dispose();
    }
  });

  it("returns Rust macro callees without arguments", async () => {
    // biome-ignore lint/security/noSecrets: test fixture code
    writeSource("macro.rs", ["fn run() {", '  module::println!("message");', "}"].join("\n"));

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("macro.rs", 1, 5);
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.data.callees.map(({ name }) => name)).toEqual(["module::println"]);
    } finally {
      await session.dispose();
    }
  });

  it("detects callees in a Go function", async () => {
    writeSource(
      "test.go",
      ["func myFunction() {", "    printHello()", "    doWork(42)", "}"].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("test.go", 1, 10);
      expect(result.kind).toBe("success");
      if (result.kind === "success") expect(result.data.callees).toHaveLength(2);
    } finally {
      await session.dispose();
    }
  });

  it("detects callees in a Go method", async () => {
    writeSource(
      "method.go",
      [
        "package sample",
        "type Worker struct{}",
        "func (w Worker) Run() {",
        "  w.prepare()",
        "  finish()",
        "}",
      ].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("method.go", 3, 20);
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.data.enclosingScope.name).toBe("Run");
      expect(result.data.callees.map(({ name }) => name)).toEqual(["w.prepare", "finish"]);
    } finally {
      await session.dispose();
    }
  });
});
