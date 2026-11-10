import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import type { DocumentSymbol, WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { createLspSemanticProvider } from "@mrclrchtr/supi-lsp/provider/lsp-semantic-provider";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveFileOutline } from "../../../../src/analysis/target/file.ts";

// Pyright starts a decorated declaration's range at its first decorator, while
// the syntax parser starts it at `def`. Both must merge into one outline row.
const SOURCE = `import functools


@functools.cache
def top():
    return 1


class Box:
    @staticmethod
    @functools.cache
    def build():
        return 2

    def plain(self):
        return 3
`;

/** Document symbols as pyright reports them for SOURCE (zero-based LSP ranges). */
const range = (line: number, character: number, endLine: number, endCharacter: number) => ({
  start: { line, character },
  end: { line: endLine, character: endCharacter },
});
const PYRIGHT_SYMBOLS: DocumentSymbol[] = [
  { name: "top", kind: 12, range: range(3, 0, 5, 12), selectionRange: range(4, 4, 4, 7) },
  {
    name: "Box",
    kind: 5,
    range: range(8, 0, 15, 16),
    selectionRange: range(8, 6, 8, 9),
    children: [
      { name: "build", kind: 6, range: range(9, 4, 12, 16), selectionRange: range(11, 8, 11, 13) },
      { name: "plain", kind: 6, range: range(14, 4, 15, 16), selectionRange: range(14, 8, 14, 13) },
    ],
  },
];

let cwd: string;
let file: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "file-decorated-merge-"));
  file = path.join(cwd, "deco.py");
  writeFileSync(file, SOURCE);
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("file outline provider merge", () => {
  it("merges decorated declarations whose ranges start at different lines", async () => {
    const semantic = createLspSemanticProvider({
      documentSymbols: async () => completedCodeQuery(PYRIGHT_SYMBOLS),
    } as unknown as WorkspaceLspRuntime);
    const treeSitter = createTreeSitterSession(cwd);
    try {
      const outcome = await resolveFileOutline(file, cwd, {
        semantic,
        structural: createTreeSitterProvider(treeSitter),
      });

      expect(outcome.kind).toBe("resolved");
      if (outcome.kind !== "resolved") return;
      expect(
        outcome.outline.targets.map(({ name, displayLine, provenance }) => [
          name,
          displayLine,
          provenance.length,
        ]),
      ).toEqual([
        ["top", 5, 2],
        ["Box", 9, 2],
        ["build", 12, 2],
        ["plain", 15, 2],
      ]);
    } finally {
      await treeSitter.dispose();
    }
  });
});
