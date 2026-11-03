import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTreeSitterSession } from "../src/session/session.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "supi-callees-depth-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeSource(fileName: string, source: string): void {
  writeFileSync(path.join(tmpDir, fileName), source, "utf-8");
}

describe("calleesAt depth filtering", () => {
  it.each(["ts", "tsx"])(
    "excludes type-only imports at both callee depths in %s",
    async (extension) => {
      const file = `type-imports.${extension}`;
      writeSource(
        file,
        `function run() {
  type Value = import("types").Value;
  const value = read<import("types").Value>();
  const module = read<typeof import("types")>();
  const values = read<import("types").Value[]>();
  const loaded = import("runtime");
  const asserted = provide() as import("types").Value;
  const checked = provide() satisfies import("types").Value;
  const callback = () => {
    const nested = read<typeof import("types")>();
    return import("nested");
  };
}
function isValue(value: unknown): value is import("types").Value { check(); return true; }
function assertValue(value: unknown): asserts value is import("types").Value { check(); }`,
      );
      const session = createTreeSitterSession(tmpDir);
      try {
        const direct = await session.calleesAt(file, 1, 10, { depth: "direct" });
        expect(direct.kind).toBe("success");
        if (direct.kind !== "success") return;
        expect(
          direct.data.callees.map(({ name, range }) => ({ name, line: range.startLine })),
        ).toEqual([
          { name: "read", line: 3 },
          { name: "read", line: 4 },
          { name: "read", line: 5 },
          { name: "import", line: 6 },
          { name: "provide", line: 7 },
          { name: "provide", line: 8 },
        ]);
        const deep = await session.calleesAt(file, 1, 10, { depth: "deep" });
        expect(deep.kind).toBe("success");
        if (deep.kind !== "success") return;
        expect(
          deep.data.callees.map(({ name, range }) => ({ name, line: range.startLine })),
        ).toEqual([
          { name: "read", line: 3 },
          { name: "read", line: 4 },
          { name: "read", line: 5 },
          { name: "import", line: 6 },
          { name: "provide", line: 7 },
          { name: "provide", line: 8 },
          { name: "read", line: 10 },
          { name: "import", line: 11 },
        ]);
        for (const line of [14, 15]) {
          const predicate = await session.calleesAt(file, line, 10, { depth: "direct" });
          expect(predicate.kind).toBe("success");
          if (predicate.kind !== "success") continue;
          expect(predicate.data.callees.map(({ name }) => name)).toEqual(["check"]);
        }
      } finally {
        await session.dispose();
      }
    },
  );

  it("excludes Python lambda calls at direct depth", async () => {
    writeSource(
      "lambda.py",
      ["def outer():", "    before()", "    callback = lambda: nested()", "    after()"].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const direct = await session.calleesAt("lambda.py", 1, 5, { depth: "direct" });
      expect(direct.kind).toBe("success");
      if (direct.kind === "success") {
        expect(direct.data.callees.map(({ name }) => name)).toEqual(["before", "after"]);
      }

      const deep = await session.calleesAt("lambda.py", 1, 5, { depth: "deep" });
      expect(deep.kind).toBe("success");
      if (deep.kind === "success") {
        expect(deep.data.callees.map(({ name }) => name)).toEqual(["before", "nested", "after"]);
      }
    } finally {
      await session.dispose();
    }
  });

  it("excludes Rust closure calls at direct depth", async () => {
    writeSource(
      "closure.rs",
      ["fn outer() {", "  before();", "  let callback = || nested();", "  after();", "}"].join(
        "\n",
      ),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const direct = await session.calleesAt("closure.rs", 1, 5, { depth: "direct" });
      expect(direct.kind).toBe("success");
      if (direct.kind === "success") {
        expect(direct.data.callees.map(({ name }) => name)).toEqual(["before", "after"]);
      }

      const deep = await session.calleesAt("closure.rs", 1, 5, { depth: "deep" });
      expect(deep.kind).toBe("success");
      if (deep.kind === "success") {
        expect(deep.data.callees.map(({ name }) => name)).toEqual(["before", "nested", "after"]);
      }
    } finally {
      await session.dispose();
    }
  });

  it("excludes Go function-literal calls at direct depth", async () => {
    writeSource(
      "literal.go",
      [
        "package sample",
        "func run() {",
        "  before()",
        "  callback := func() { nested() }",
        "  after()",
        "}",
      ].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const direct = await session.calleesAt("literal.go", 2, 5, { depth: "direct" });
      expect(direct.kind).toBe("success");
      if (direct.kind === "success") {
        expect(direct.data.callees.map(({ name }) => name)).toEqual(["before", "after"]);
      }

      const deep = await session.calleesAt("literal.go", 2, 5, { depth: "deep" });
      expect(deep.kind).toBe("success");
      if (deep.kind === "success") {
        expect(deep.data.callees.map(({ name }) => name)).toEqual(["before", "nested", "after"]);
      }
    } finally {
      await session.dispose();
    }
  });

  it("excludes Java lambda calls at direct depth", async () => {
    writeSource(
      "lambda.java",
      [
        "class Worker {",
        "  void run() {",
        "    before();",
        "    Runnable task = () -> callback();",
        "    after();",
        "  }",
        "}",
      ].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const direct = await session.calleesAt("lambda.java", 2, 8, { depth: "direct" });
      expect(direct.kind).toBe("success");
      if (direct.kind === "success") {
        expect(direct.data.callees.map(({ name }) => name)).toEqual(["before", "after"]);
      }

      const deep = await session.calleesAt("lambda.java", 2, 8, { depth: "deep" });
      expect(deep.kind).toBe("success");
      if (deep.kind === "success") {
        expect(deep.data.callees.map(({ name }) => name)).toEqual(["before", "callback", "after"]);
      }
    } finally {
      await session.dispose();
    }
  });

  it("excludes Ruby block calls at direct depth", async () => {
    writeSource(
      "block.rb",
      [
        "def outer",
        "  before()",
        "  items.each() do |item|",
        "    nested()",
        "  end",
        "  after()",
        "end",
      ].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const direct = await session.calleesAt("block.rb", 1, 5, { depth: "direct" });
      expect(direct.kind).toBe("success");
      if (direct.kind === "success") {
        expect(direct.data.callees.map(({ name }) => name)).toEqual([
          "before",
          "items.each",
          "after",
        ]);
      }

      const deep = await session.calleesAt("block.rb", 1, 5, { depth: "deep" });
      expect(deep.kind).toBe("success");
      if (deep.kind === "success") {
        expect(deep.data.callees.map(({ name }) => name)).toEqual([
          "before",
          "items.each",
          "nested",
          "after",
        ]);
      }
    } finally {
      await session.dispose();
    }
  });

  it("excludes C++ lambda calls at direct depth", async () => {
    writeSource(
      "lambda.cpp",
      [
        "void run() {",
        "  before();",
        "  auto callback = []() { nested(); };",
        "  after();",
        "}",
      ].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const direct = await session.calleesAt("lambda.cpp", 1, 5, { depth: "direct" });
      expect(direct.kind).toBe("success");
      if (direct.kind === "success") {
        expect(direct.data.callees.map(({ name }) => name)).toEqual(["before", "after"]);
      }

      const deep = await session.calleesAt("lambda.cpp", 1, 5, { depth: "deep" });
      expect(deep.kind).toBe("success");
      if (deep.kind === "success") {
        expect(deep.data.callees.map(({ name }) => name)).toEqual(["before", "nested", "after"]);
      }
    } finally {
      await session.dispose();
    }
  });

  it("excludes Kotlin lambda and anonymous-function calls at direct depth", async () => {
    writeSource(
      "lambda.kt",
      [
        "fun run() {",
        "  before()",
        "  val callback = { nested() }",
        "  val other = fun() { anonymousNested() }",
        "  after()",
        "}",
      ].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const direct = await session.calleesAt("lambda.kt", 1, 5, { depth: "direct" });
      expect(direct.kind).toBe("success");
      if (direct.kind === "success") {
        expect(direct.data.callees.map(({ name }) => name)).toEqual(["before", "after"]);
      }

      const deep = await session.calleesAt("lambda.kt", 1, 5, { depth: "deep" });
      expect(deep.kind).toBe("success");
      if (deep.kind === "success") {
        expect(deep.data.callees.map(({ name }) => name)).toEqual([
          "before",
          "nested",
          "anonymousNested",
          "after",
        ]);
      }
    } finally {
      await session.dispose();
    }
  });

  it("filters out callees from nested functions", async () => {
    writeSource(
      "nested.ts",
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
      const result = await session.calleesAt("nested.ts", 2, 3);
      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.data.enclosingScope.name).toBe("outer");
        const names = result.data.callees.map(({ name }) => name);
        expect(names).toContain("inner");
        expect(names).not.toContain("deeplyNested");
      }
    } finally {
      await session.dispose();
    }
  });

  it("uses full points to exclude a same-line nested scope at direct depth", async () => {
    writeSource(
      "same-line.ts",
      "function outer() { before(); const inner = () => nested(); after(); }\n",
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const direct = await session.calleesAt("same-line.ts", 1, 10, { depth: "direct" });
      expect(direct.kind).toBe("success");
      if (direct.kind === "success") {
        expect(direct.data.callees.map(({ name }) => name)).toEqual(["before", "after"]);
      }

      const deep = await session.calleesAt("same-line.ts", 1, 10, { depth: "deep" });
      expect(deep.kind).toBe("success");
      if (deep.kind === "success") {
        expect(deep.data.callees.map(({ name }) => name)).toEqual(["before", "nested", "after"]);
      }
    } finally {
      await session.dispose();
    }
  });
});
