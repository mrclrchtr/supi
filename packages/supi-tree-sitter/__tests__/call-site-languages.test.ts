import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTreeSitterSession } from "../src/session/session.ts";

const CALL_LANGUAGE_CASES = [
  { file: "sample.js", source: "foo();\n" },
  { file: "sample.ts", source: "foo();\n" },
  { file: "sample.tsx", source: "foo();\n" },
  { file: "sample.py", source: "foo()\n" },
  { file: "sample.rs", source: "fn main() { foo(); }\n" },
  { file: "sample.go", source: "package main\nfunc main() { foo() }\n" },
  { file: "sample.c", source: "int main(void) { foo(); }\n" },
  { file: "sample.cpp", source: "int main() { foo(); }\n" },
  { file: "sample.java", source: "class X { void x() { foo(); } }\n" },
  { file: "sample.kt", source: "fun main() { foo() }\n" },
  { file: "sample.rb", source: "foo()\n" },
  { file: "sample.sh", source: "foo\n" },
  { file: "sample.r", source: "foo()\n" },
] as const;

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "call-site-languages-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("declared call-site language support", () => {
  it.each(CALL_LANGUAGE_CASES)(
    "executes the registered query for $file",
    async ({ file, source }) => {
      writeFileSync(path.join(tmpDir, file), source);
      const session = createTreeSitterSession(tmpDir);

      try {
        const result = await session.callSites(file);
        expect(result).toMatchObject({
          kind: "success",
          data: [expect.objectContaining({ name: "foo" })],
        });
      } finally {
        session.dispose();
      }
    },
  );

  it.each([
    { file: "sample.html", source: "<button>foo</button>\n" },
    { file: "sample.sql", source: "SELECT foo();\n" },
  ])("rejects $file because no call-site query is registered", async ({ file, source }) => {
    writeFileSync(path.join(tmpDir, file), source);
    const session = createTreeSitterSession(tmpDir);

    try {
      await expect(session.callSites(file)).resolves.toMatchObject({
        kind: "unsupported-language",
      });
    } finally {
      session.dispose();
    }
  });
});
