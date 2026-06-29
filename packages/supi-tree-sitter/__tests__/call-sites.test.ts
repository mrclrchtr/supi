/**
 * Integration-style tests for TypeScript family full-expression call-site extraction.
 *
 * These tests use real Tree-sitter WASM grammars against temp fixture files
 * to verify that call-site captures return the full callee expression
 * instead of just a leaf identifier.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTreeSitterSession } from "../src/session/session.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "call-sites-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("TypeScript call-site extraction (full-expression)", () => {
  it("returns full member expression for params.query.trim()", async () => {
    writeFileSync(
      path.join(tmpDir, "sample.ts"),
      [
        "interface Query { trim(): string }",
        "interface Params { query: Query }",
        "function process(params: Params) {",
        "  const result = params.query.trim();",
        "  return result;",
        "}",
        "",
      ].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.callSites("sample.ts");

      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;

      const names = result.data.map((entry) => entry.name);
      expect(names).toContain("params.query.trim");
    } finally {
      session.dispose();
    }
  });

  it("returns full member expression for obj.method()", async () => {
    writeFileSync(
      path.join(tmpDir, "sample.ts"),
      [
        "class Foo { method() { return 1; } }",
        "const obj = new Foo();",
        "const x = obj.method();",
        "",
      ].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.callSites("sample.ts");

      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;

      const names = result.data.map((entry) => entry.name);
      expect(names).toContain("obj.method");
    } finally {
      session.dispose();
    }
  });

  it("returns constructor name for new Thing()", async () => {
    writeFileSync(
      path.join(tmpDir, "sample.ts"),
      ["class Thing {}", "const t = new Thing();", ""].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.callSites("sample.ts");

      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;

      const names = result.data.map((entry) => entry.name);
      expect(names).toContain("Thing");
    } finally {
      session.dispose();
    }
  });

  it("returns outer call in factory()()", async () => {
    writeFileSync(
      path.join(tmpDir, "sample.ts"),
      ["function factory() { return () => 42; }", "const result = factory()();", ""].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.callSites("sample.ts");

      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;

      const names = result.data.map((entry) => entry.name);
      // The outer call expression's callee is `factory()`
      expect(names).toContain("factory()");
    } finally {
      session.dispose();
    }
  });

  it("returns tag name for tagged template", async () => {
    writeFileSync(
      path.join(tmpDir, "sample.ts"),
      [
        'function tagged(strings: TemplateStringsArray, ...values: unknown[]) { return ""; }',
        "const result = tagged`x`;",
        "",
      ].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.callSites("sample.ts");

      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;

      const names = result.data.map((entry) => entry.name);
      expect(names).toContain("tagged");
    } finally {
      session.dispose();
    }
  });
});

describe("JSX/TSX call-site extraction (full-expression)", () => {
  it("returns full member expression in TSX", async () => {
    writeFileSync(
      path.join(tmpDir, "sample.tsx"),
      [
        'import { render } from "preact";',
        "const api = { call: (x: string) => x };",
        'const result = api.call("hello");',
        "export default result;",
        "",
      ].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.callSites("sample.tsx");

      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;

      const names = result.data.map((entry) => entry.name);
      expect(names).toContain("api.call");
    } finally {
      session.dispose();
    }
  });
});

describe("JavaScript call-site extraction (full-expression)", () => {
  it("returns full member expression in JS", async () => {
    writeFileSync(
      path.join(tmpDir, "sample.js"),
      ["const obj = { method() { return 1; } };", "const x = obj.method();", ""].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.callSites("sample.js");

      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;

      const names = result.data.map((entry) => entry.name);
      expect(names).toContain("obj.method");
    } finally {
      session.dispose();
    }
  });
});
