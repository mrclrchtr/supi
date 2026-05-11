import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTreeSitterSession } from "../src/session.ts";

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
  it("exposes calleesAt as a function on the session", () => {
    const session = createTreeSitterSession(tmpDir);
    try {
      expect(session.calleesAt).toEqual(expect.any(Function));
    } finally {
      session.dispose();
    }
  });

  it("returns validation-error for invalid coordinates", async () => {
    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("test.ts", 0, 5);
      expect(result.kind).toBe("validation-error");
    } finally {
      session.dispose();
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
      session.dispose();
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
      if (result.kind === "success") {
        expect(result.data.callees).toHaveLength(2);
      }
    } finally {
      session.dispose();
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
      session.dispose();
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
      if (result.kind === "success") {
        expect(result.data.callees).toHaveLength(2);
      }
    } finally {
      session.dispose();
    }
  });

  it("filters out callees from nested functions", async () => {
    writeSource(
      "test.ts",
      [
        "function outer() {",
        "  inner();",
        "  function inner() {",
        "    deeplyNested();",
        "  }",
        "}",
      ].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      // Anchor in outer function body (L2)
      const result = await session.calleesAt("test.ts", 2, 3);
      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data.enclosingScope.name).toBe("outer");
        // Should NOT include deeplyNested which is inside inner()
        const names = result.data.callees.map((c) => c.name);
        expect(names).toContain("inner");
        expect(names).not.toContain("deeplyNested");
      }
    } finally {
      session.dispose();
    }
  });

  it("returns unsupported-language for HTML files", async () => {
    writeSource("test.html", "<html><body><p>hello</p></body></html>");

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("test.html", 1, 5);
      expect(result.kind).toBe("unsupported-language");
    } finally {
      session.dispose();
    }
  });

  it("returns unsupported-language for SQL files", async () => {
    writeSource("test.sql", "SELECT * FROM users WHERE id = 1;");

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("test.sql", 1, 5);
      expect(result.kind).toBe("unsupported-language");
    } finally {
      session.dispose();
    }
  });
});
