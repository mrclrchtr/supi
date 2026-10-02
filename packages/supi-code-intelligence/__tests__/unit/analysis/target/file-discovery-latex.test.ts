import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import type { DocumentSymbol, WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { createLspSemanticProvider } from "@mrclrchtr/supi-lsp/provider/lsp-semantic-provider";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import { afterEach, describe, expect, it } from "vitest";
import { resolveFileTargetGroup } from "../../../../src/analysis/target/file.ts";

let cwd: string;
afterEach(() => {
  if (cwd) rmSync(cwd, { recursive: true, force: true });
});

describe("LaTeX file target discovery", () => {
  it("merges actual Texlab symbol kinds with structural LaTeX declarations", async () => {
    cwd = mkdtempSync(path.join(os.tmpdir(), "latex-target-discovery-"));
    const file = path.join(cwd, "paper.tex");
    writeFileSync(
      file,
      String.raw`\section{Overview}
\newcommand{\vect}[1]{#1}
\newenvironment{proofsketch}{}{}
\label{sec:intro}`,
    );

    // Texlab 5.26 reports a heading as Module and a command as Key, named "define \\vect".
    // It reports the label as heading detail and does not emit the environment definition.
    const documentSymbols: DocumentSymbol[] = [
      {
        name: "Overview",
        detail: "sec:intro",
        kind: 2,
        range: { start: { line: 0, character: 0 }, end: { line: 3, character: 17 } },
        selectionRange: { start: { line: 3, character: 0 }, end: { line: 3, character: 17 } },
        children: [
          {
            name: "define \\vect",
            kind: 20,
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 25 } },
            selectionRange: { start: { line: 1, character: 12 }, end: { line: 1, character: 17 } },
          },
        ],
      },
    ];
    const semantic = createLspSemanticProvider({
      documentSymbols: async () => completedCodeQuery(documentSymbols),
    } as unknown as WorkspaceLspRuntime);
    const treeSitter = createTreeSitterSession(cwd);
    const structural = createTreeSitterProvider(treeSitter);

    try {
      const outcome = await resolveFileTargetGroup(file, cwd, { semantic, structural });

      expect(outcome.kind).toBe("resolved");
      if (outcome.kind !== "resolved") return;
      expect(outcome.group.targets.map(({ name, kind }) => [name, kind])).toEqual([
        ["Overview", "Module"],
        ["define \\vect", "Key"],
        ["proofsketch", "environment"],
        ["sec:intro", "label"],
      ]);
      expect(outcome.group.targets.find(({ name }) => name === "Overview")).toMatchObject({
        kind: "Module",
        identityKind: "latex-section",
        provenance: ["semantic", "structural"],
      });
      expect(outcome.group.targets.find(({ name }) => name === "define \\vect")).toMatchObject({
        kind: "Key",
        identityKind: "latex-command",
        provenance: ["semantic", "structural"],
      });
      expect(outcome.group.targets.find(({ name }) => name === "proofsketch")).toMatchObject({
        kind: "environment",
        provenance: ["structural"],
      });
      expect(outcome.group.targets.find(({ name }) => name === "sec:intro")).toMatchObject({
        kind: "label",
        provenance: ["structural"],
      });
    } finally {
      await treeSitter.dispose();
    }
  });
});
