import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTreeSitterSession } from "../src/session/session.ts";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "supi-call-site-correctness-"));
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("full-source-shape call sites", () => {
  it("extracts C member and function-pointer callees without arguments", async () => {
    writeFileSync(
      join(cwd, "sample.c"),
      [
        "void run(void);",
        "void go(void);",
        "void (*callback)(void);",
        "void main(void) {",
        '  obj.run("argument");',
        "  ptr->go();",
        "  (*callback)(42);",
        "}",
      ].join("\n"),
    );
    const session = createTreeSitterSession(cwd);

    try {
      const result = await session.callSites("sample.c");

      expect(result).toMatchObject({ kind: "success" });
      if (result.kind !== "success") return;
      expect(result.data.map(({ name }) => name)).toEqual(["obj.run", "ptr->go", "(*callback)"]);
    } finally {
      await session.dispose();
    }
  });

  it("extracts Rust paths, fields, and scoped macros without arguments", async () => {
    writeFileSync(
      join(cwd, "sample.rs"),
      [
        "fn main() {",
        "  module::fun(1);",
        "  Type::new();",
        "  obj.method();",
        '  scoped::println!("hello");',
        "}",
      ].join("\n"),
    );
    const session = createTreeSitterSession(cwd);

    try {
      const result = await session.callSites("sample.rs");

      expect(result).toMatchObject({ kind: "success" });
      if (result.kind !== "success") return;
      expect(result.data.map(({ name }) => name)).toEqual([
        "module::fun",
        "Type::new",
        "obj.method",
        "scoped::println",
      ]);
    } finally {
      await session.dispose();
    }
  });

  it("extracts C++ qualified, member, and pointer callees", async () => {
    writeFileSync(
      join(cwd, "sample.cpp"),
      [
        "void main() {",
        "  ns::fun(1);",
        "  obj.member();",
        "  ptr->run();",
        "  callback();",
        "}",
      ].join("\n"),
    );
    const session = createTreeSitterSession(cwd);

    try {
      const result = await session.callSites("sample.cpp");

      expect(result).toMatchObject({ kind: "success" });
      if (result.kind !== "success") return;
      expect(result.data.map(({ name }) => name)).toEqual([
        "ns::fun",
        "obj.member",
        "ptr->run",
        "callback",
      ]);
    } finally {
      await session.dispose();
    }
  });

  it("extracts R namespace and member callees", async () => {
    writeFileSync(join(cwd, "sample.r"), ["pkg::fun(1)", "obj$method()", "plain()"].join("\n"));
    const session = createTreeSitterSession(cwd);

    try {
      const result = await session.callSites("sample.r");

      expect(result).toMatchObject({ kind: "success" });
      if (result.kind !== "success") return;
      expect(result.data.map(({ name }) => name)).toEqual(["pkg::fun", "obj$method", "plain"]);
    } finally {
      await session.dispose();
    }
  });

  it("extracts Java qualified and static method callees without arguments", async () => {
    writeFileSync(
      join(cwd, "Sample.java"),
      [
        "class Sample {",
        "  void run() {",
        '    java.util.Objects.requireNonNull("value");',
        "    Type.staticMethod(1);",
        "    obj.method();",
        "  }",
        "}",
      ].join("\n"),
    );
    const session = createTreeSitterSession(cwd);

    try {
      const result = await session.callSites("Sample.java");

      expect(result).toMatchObject({ kind: "success" });
      if (result.kind !== "success") return;
      expect(result.data.map(({ name }) => name)).toEqual([
        "java.util.Objects.requireNonNull",
        "Type.staticMethod",
        "obj.method",
      ]);
    } finally {
      await session.dispose();
    }
  });

  it("extracts Go selector and function-pointer callees", async () => {
    writeFileSync(
      join(cwd, "sample.go"),
      ["package sample", "func main() {", "  obj.Run(1)", "  ptr.Go()", "  callback()", "}"].join(
        "\n",
      ),
    );
    const session = createTreeSitterSession(cwd);

    try {
      const result = await session.callSites("sample.go");

      expect(result).toMatchObject({ kind: "success" });
      if (result.kind !== "success") return;
      expect(result.data.map(({ name }) => name)).toEqual(["obj.Run", "ptr.Go", "callback"]);
    } finally {
      await session.dispose();
    }
  });

  it("extracts Python attribute callees", async () => {
    writeFileSync(join(cwd, "sample.py"), ["pkg.fun(1)", "obj.method()", "plain()"].join("\n"));
    const session = createTreeSitterSession(cwd);

    try {
      const result = await session.callSites("sample.py");

      expect(result).toMatchObject({ kind: "success" });
      if (result.kind !== "success") return;
      expect(result.data.map(({ name }) => name)).toEqual(["pkg.fun", "obj.method", "plain"]);
    } finally {
      await session.dispose();
    }
  });

  it("extracts Kotlin navigation callees", async () => {
    writeFileSync(
      join(cwd, "sample.kt"),
      ["fun main() {", "  pkg.fun(1)", "  obj.method()", "  plain()", "}"].join("\n"),
    );
    const session = createTreeSitterSession(cwd);

    try {
      const result = await session.callSites("sample.kt");

      expect(result).toMatchObject({ kind: "success" });
      if (result.kind !== "success") return;
      expect(result.data.map(({ name }) => name)).toEqual(["pkg.fun", "obj.method", "plain"]);
    } finally {
      await session.dispose();
    }
  });

  it("extracts Ruby receiver and method callees", async () => {
    writeFileSync(join(cwd, "sample.rb"), ["obj.method(1)", "plain(2)"].join("\n"));
    const session = createTreeSitterSession(cwd);

    try {
      const result = await session.callSites("sample.rb");

      expect(result).toMatchObject({ kind: "success" });
      if (result.kind !== "success") return;
      expect(result.data.map(({ name }) => name)).toEqual(["obj.method", "plain"]);
    } finally {
      await session.dispose();
    }
  });
});
