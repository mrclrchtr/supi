import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { completedCodeQuery, type DocumentCodeSymbol } from "@mrclrchtr/supi-code-runtime/api";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveFileOutline } from "../../../../src/analysis/target/file.ts";

// TypeScript's language server reports every imported binding and every name
// in an `export { … }` list as a document symbol. They are not declarations of
// the file, so the outline counts them instead of listing them.
const SOURCE = `import { readFileSync } from "node:fs";
import type { Stats } from "node:fs";
export { join } from "node:path";
const local = 1;
export { local, local as renamed };
export function useAll(stats: Stats): string {
  return readFileSync("x", "utf8") + String(stats) + join("a");
}
`;

/** Language-server symbols as TypeScript reports them for SOURCE (1-based anchors). */
const symbol = (name: string, kind: string, line: number, character: number) =>
  ({
    name,
    kind,
    file: "",
    declarationAnchor: { line, character },
    nameAnchor: { line, character },
    container: null,
    level: "top-level",
  }) satisfies DocumentCodeSymbol;

let cwd: string;
let file: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "file-outline-omissions-"));
  file = path.join(cwd, "sample.ts");
  writeFileSync(file, SOURCE);
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("file outline omissions", () => {
  it("counts imported names, export-list names, and re-export statements but keeps own declarations", async () => {
    const symbols = [
      symbol("readFileSync", "Variable", 1, 10),
      symbol("Stats", "Variable", 2, 15),
      symbol("join", "Variable", 3, 10),
      symbol("local", "Variable", 4, 7),
      symbol("local", "Variable", 5, 10),
      symbol("renamed", "Variable", 5, 26),
      symbol("useAll", "Function", 6, 17),
    ].map((entry) => ({ ...entry, file }));
    const semantic = {
      documentSymbols: async () => completedCodeQuery(symbols),
      workspaceSymbols: async () => completedCodeQuery([]),
      references: async () => completedCodeQuery([]),
      implementation: async () => completedCodeQuery([]),
    };
    const treeSitter = createTreeSitterSession(cwd);
    try {
      const outcome = await resolveFileOutline(file, cwd, {
        semantic,
        structural: createTreeSitterProvider(treeSitter),
      });

      expect(outcome.kind).toBe("resolved");
      if (outcome.kind !== "resolved") return;
      // The own export list stays; `export … from` only forwards another module's names.
      expect(outcome.outline.targets.map(({ name, displayLine }) => [name, displayLine])).toEqual([
        ["local", 4],
        ["{ local, local as renamed };", 5],
        ["useAll", 6],
      ]);
      expect(outcome.outline.notListed).toEqual({
        importedNames: { count: 2, startLine: 1, endLine: 2 },
        exportListNames: { count: 3, startLine: 3, endLine: 5 },
        reExportStatements: { count: 1, startLine: 3, endLine: 3 },
        localDeclarations: 0,
      });
    } finally {
      await treeSitter.dispose();
    }
  });

  it("keeps language-server names listed when the syntax parser is unavailable", async () => {
    const semantic = {
      documentSymbols: async () =>
        completedCodeQuery([{ ...symbol("readFileSync", "Variable", 1, 10), file }]),
      workspaceSymbols: async () => completedCodeQuery([]),
      references: async () => completedCodeQuery([]),
      implementation: async () => completedCodeQuery([]),
    };

    const outcome = await resolveFileOutline(file, cwd, { semantic });

    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") return;
    expect(outcome.outline.targets.map(({ name }) => name)).toEqual(["readFileSync"]);
    expect(outcome.outline.notListed.importedNames).toBeNull();
  });
});
