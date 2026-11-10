import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isFileLocalTopLevelDeclaration } from "../../src/manager/typescript-file-local.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

/** Write `source` and return a probe for the zero-based position of `needle`'s Nth occurrence. */
function fileWith(source: string): (needle: string, occurrence?: number) => boolean {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-file-local-"));
  roots.push(root);
  const file = path.join(root, "sample.ts");
  fs.writeFileSync(file, source);
  return (needle, occurrence = 0) => {
    let offset = -1;
    for (let index = 0; index <= occurrence; index++) offset = source.indexOf(needle, offset + 1);
    const before = source.slice(0, offset).split("\n");
    const position = { line: before.length - 1, character: (before.at(-1) ?? "").length };
    return isFileLocalTopLevelDeclaration(file, position);
  };
}

describe("isFileLocalTopLevelDeclaration", () => {
  it("accepts only unexported top-level declarations of a module", () => {
    const at = fileWith(
      [
        'import { x } from "x";',
        "function hidden() {}",
        "const kept = 1, listed = 2;",
        "class Renamed {}",
        "export function shown() {}",
        "export { listed, Renamed as Public };",
        "class Box { method() {} }",
      ].join("\n"),
    );

    expect(at("hidden")).toBe(true);
    expect(at("kept")).toBe(true);
    expect(at("listed")).toBe(false);
    expect(at("Renamed")).toBe(false);
    expect(at("shown")).toBe(false);
    // Members can be reached through an exported or returned instance.
    expect(at("method")).toBe(false);
  });

  it("treats files without imports or exports as global scripts", () => {
    const at = fileWith("function global() {}\n");
    expect(at("global")).toBe(false);
  });

  it("treats default and assignment exports as exported", () => {
    expect(fileWith("function main() {}\nexport default main;\n")("main")).toBe(false);
    expect(fileWith("declare function ambient(): void;\nexport {};\n")("ambient")).toBe(false);
  });
});
