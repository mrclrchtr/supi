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

// The native TypeScript server reports a type alias as `Class` and an accessor
// as `Property`; the syntax parser reports a type alias and a method. Each pair
// must merge into one outline row.
const SOURCE = `type Tab = "a" | "b";

class Dialog {
  #focused = false;
  get focused(): boolean {
    return this.#focused;
  }
  set focused(value: boolean) {
    this.#focused = value;
  }
  size = 1;
  close(): void {}
}
`;

const range = (line: number, character: number, endLine: number, endCharacter: number) => ({
  start: { line, character },
  end: { line: endLine, character: endCharacter },
});
/** Document symbols as the native TypeScript server reports them for SOURCE (zero-based). */
const NATIVE_SYMBOLS: DocumentSymbol[] = [
  { name: "Tab", kind: 5, range: range(0, 0, 0, 21), selectionRange: range(0, 5, 0, 8) },
  {
    name: "Dialog",
    kind: 5,
    range: range(2, 0, 12, 1),
    selectionRange: range(2, 6, 2, 12),
    children: [
      { name: "#focused", kind: 7, range: range(3, 2, 3, 19), selectionRange: range(3, 2, 3, 10) },
      { name: "focused", kind: 7, range: range(4, 2, 6, 3), selectionRange: range(4, 6, 4, 13) },
      { name: "focused", kind: 7, range: range(7, 2, 9, 3), selectionRange: range(7, 6, 7, 13) },
      { name: "size", kind: 7, range: range(10, 2, 10, 11), selectionRange: range(10, 2, 10, 6) },
      { name: "close", kind: 6, range: range(11, 2, 11, 18), selectionRange: range(11, 2, 11, 7) },
    ],
  },
];

let cwd: string;
let file: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "file-native-ts-merge-"));
  file = path.join(cwd, "dialog.ts");
  writeFileSync(file, SOURCE);
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("file outline merge of native TypeScript server kinds", () => {
  // The per-symbol syntax lookup is rejected when many run at once
  // ("Structural Worker mailbox is busy"); the merge must not depend on it.
  it.each(["available", "busy"] as const)(
    "lists a type alias and each accessor once with a syntax lookup that is %s",
    async (lookup) => {
      const semantic = createLspSemanticProvider({
        getOpenDocumentContent: () => null,
        documentSymbols: async () => completedCodeQuery(NATIVE_SYMBOLS),
      } as unknown as WorkspaceLspRuntime);
      const treeSitter = createTreeSitterSession(cwd);
      const structural = createTreeSitterProvider(treeSitter);
      try {
        const outcome = await resolveFileOutline(file, cwd, {
          semantic,
          structural:
            lookup === "available"
              ? structural
              : {
                  ...structural,
                  nodeAt: async () => ({ kind: "runtime-error", message: "busy" }),
                },
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
          ["Tab", 1, 2],
          ["Dialog", 3, 2],
          ["#focused", 4, 2],
          ["focused", 5, 2],
          ["focused", 8, 2],
          ["size", 11, 2],
          ["close", 12, 2],
        ]);
      } finally {
        await treeSitter.dispose();
      }
    },
  );
});
