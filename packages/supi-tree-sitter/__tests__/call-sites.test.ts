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
  it("retains same-line calls by exact source range and excludes JSX tags", async () => {
    writeFileSync(
      path.join(tmpDir, "same-line.tsx"),
      "function invoke() {}\ninvoke(); invoke(); const view = <Widget />;\n",
    );
    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.callSites("same-line.tsx");
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      const calls = result.data.filter((entry) => entry.name === "invoke");
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ startLine: 2, startCharacter: 1, endLine: 2 });
      expect(calls[1]?.startCharacter).toBeGreaterThan(calls[0]?.startCharacter ?? 0);
      expect(result.data.some((entry) => entry.name === "Widget")).toBe(false);
    } finally {
      await session.dispose();
    }
  });

  it.each(["ts", "tsx"])(
    "excludes type-only imports but retains expression calls in %s",
    async (extension) => {
      const file = `type-imports.${extension}`;
      writeFileSync(
        path.join(tmpDir, file),
        `type Value = import("types").Value;
type Module = typeof import("types");
function run() {
  const value = read<import("types").Value>();
  const module = read<typeof import("types")>();
  const values = read<import("types").Value[]>();
  const loaded = import("runtime");
  const asserted = provide("🌲") as import("types").Value;
  const checked = provide() satisfies import("types").Value;
  const runtimeAssertion = import("asserted") as unknown;
  const runtimeCheck = import("checked") satisfies unknown;
  const runtimeTypeof = typeof import("typed");
  let annotated: import("types").Value;
}
function isValue(value: unknown): value is import("types").Value {
  check();
  return true;
}
function assertValue(value: unknown): asserts value is import("types").Value {
  check();
}`,
      );
      const session = createTreeSitterSession(tmpDir);
      try {
        const result = await session.callSites(file);
        expect(result.kind).toBe("success");
        if (result.kind !== "success") return;
        expect(result.data.map(({ name, startLine }) => ({ name, line: startLine }))).toEqual([
          { name: "read", line: 4 },
          { name: "read", line: 5 },
          { name: "read", line: 6 },
          { name: "import", line: 7 },
          { name: "provide", line: 8 },
          { name: "provide", line: 9 },
          { name: "import", line: 10 },
          { name: "import", line: 11 },
          { name: "import", line: 12 },
          { name: "check", line: 16 },
          { name: "check", line: 20 },
        ]);
      } finally {
        await session.dispose();
      }
    },
  );

  it("preserves syntax-recovery evidence after excluding type-only imports", async () => {
    writeFileSync(
      path.join(tmpDir, "broken.ts"),
      `type Value = import("types").Value;
read<import("types").Value>();
import("runtime");
export type *;`,
    );
    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.callSites("broken.ts");
      expect(result.kind).toBe("partial");
      if (result.kind !== "partial") return;
      expect(result.errorRanges.length).toBeGreaterThan(0);
      expect(result.data.map(({ name }) => name)).toEqual(["read", "import"]);
    } finally {
      await session.dispose();
    }
  });

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
      await session.dispose();
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
      await session.dispose();
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
      await session.dispose();
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
      await session.dispose();
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
      await session.dispose();
    }
  });
});
