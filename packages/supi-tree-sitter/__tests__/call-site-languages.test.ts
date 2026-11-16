import { writeFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { useSharedTreeSitterSession } from "./helpers/shared-session.ts";

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

const workspace = useSharedTreeSitterSession("call-site-languages-");

describe("declared call-site language support", () => {
  it.each(CALL_LANGUAGE_CASES)(
    "executes the registered query for $file",
    async ({ file, source }) => {
      writeFileSync(path.join(workspace.cwd, file), source);
      const result = await workspace.session.callSites(file);
      expect(result).toMatchObject({
        kind: "success",
        data: [expect.objectContaining({ name: "foo" })],
      });
    },
  );

  it.each([
    { file: "sample.html", source: "<button>foo</button>\n" },
    { file: "sample.sql", source: "SELECT foo();\n" },
  ])("rejects $file because no call-site query is registered", async ({ file, source }) => {
    writeFileSync(path.join(workspace.cwd, file), source);
    await expect(workspace.session.callSites(file)).resolves.toMatchObject({
      kind: "unsupported-language",
    });
  });
});
