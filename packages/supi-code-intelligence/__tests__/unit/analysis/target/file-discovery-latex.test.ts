import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import type { DocumentSymbol, WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { createLspSemanticProvider } from "@mrclrchtr/supi-lsp/provider/lsp-semantic-provider";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import { afterEach, describe, expect, it } from "vitest";
import { resolveAnchoredSymbolTarget } from "../../../../src/analysis/target/anchored.ts";
import { resolveFileTargetGroup } from "../../../../src/analysis/target/file.ts";
import type { ResolvedTargetData } from "../../../../src/analysis/target/types.ts";
import {
  registerWorkflowTarget,
  type TargetStoreEntry,
} from "../../../../src/session/target-store.ts";

let cwd: string;
afterEach(() => {
  if (cwd) rmSync(cwd, { recursive: true, force: true });
});

describe("LaTeX file target discovery", () => {
  it("keeps comment text out of structural label names and preserves token anchors", async () => {
    cwd = mkdtempSync(path.join(os.tmpdir(), "latex-target-comments-"));
    const file = path.join(cwd, "paper.tex");
    writeFileSync(
      file,
      String.raw`\label{sec:intro_label% trailing comment
}
\label{%
sec:next}`,
    );
    const treeSitter = createTreeSitterSession(cwd);
    const structural = createTreeSitterProvider(treeSitter);

    try {
      const outcome = await resolveFileTargetGroup(file, cwd, { structural });

      expect(outcome.kind).toBe("resolved");
      if (outcome.kind !== "resolved") return;
      expect(outcome.group.targets.filter(({ kind }) => kind === "label")).toMatchObject([
        {
          name: "sec:intro_label",
          position: { line: 0, character: 7 },
          displayLine: 1,
          displayCharacter: 8,
          anchorKind: "name",
        },
        {
          name: "sec:next",
          position: { line: 3, character: 0 },
          displayLine: 4,
          displayCharacter: 1,
          anchorKind: "name",
        },
      ]);
    } finally {
      await treeSitter.dispose();
    }
  });

  it("uses the section title when Texlab selects the same suffix in its label", async () => {
    cwd = mkdtempSync(path.join(os.tmpdir(), "latex-heading-target-"));
    const file = path.join(cwd, "paper.tex");
    writeFileSync(
      file,
      String.raw`\documentclass{article}
\begin{document}
\section{Intro}
\label{sec:Intro}
\end{document}
`,
    );
    const semantic = createLspSemanticProvider({
      documentSymbols: async () =>
        completedCodeQuery([
          {
            name: "Intro",
            kind: 2,
            range: {
              start: { line: 2, character: 0 },
              end: { line: 3, character: 17 },
            },
            selectionRange: {
              start: { line: 3, character: 11 },
              end: { line: 3, character: 16 },
            },
          },
        ]),
    } as unknown as WorkspaceLspRuntime);
    const treeSitter = createTreeSitterSession(cwd);
    const structural = createTreeSitterProvider(treeSitter);

    try {
      const outcome = await resolveFileTargetGroup(file, cwd, { semantic, structural });

      expect(outcome.kind).toBe("resolved");
      if (outcome.kind !== "resolved") return;
      expect(outcome.group.targets.find(({ name }) => name === "Intro")).toMatchObject({
        name: "Intro",
        kind: "Module",
        identityKind: "latex-section",
        position: { line: 2, character: 9 },
        displayLine: 3,
        displayCharacter: 10,
        declarationAnchor: { line: 3, character: 1 },
        anchorKind: "name",
        provenance: ["semantic", "structural"],
      });
    } finally {
      await treeSitter.dispose();
    }
  });

  it("uses one target handle for a file section and its semantic point anchor", async () => {
    cwd = mkdtempSync(path.join(os.tmpdir(), "latex-heading-handle-"));
    const file = path.join(cwd, "paper.tex");
    writeFileSync(file, String.raw`\section{Intro, overview}`);
    const documentSymbols = [
      {
        name: "Intro, overview",
        kind: 2,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 25 },
        },
        selectionRange: {
          start: { line: 0, character: 9 },
          end: { line: 0, character: 24 },
        },
      },
    ];
    const semantic = createLspSemanticProvider({
      documentSymbols: async () => completedCodeQuery(documentSymbols),
    } as unknown as WorkspaceLspRuntime);
    const treeSitter = createTreeSitterSession(cwd);
    const structural = createTreeSitterProvider(treeSitter);

    try {
      const fileOutcome = await resolveFileTargetGroup(file, cwd, { semantic, structural });
      const anchorOutcome = await resolveAnchoredSymbolTarget(file, 1, 10, {
        documentSymbols: semantic.documentSymbols,
        outline: structural.outline,
      });

      expect(fileOutcome.kind).toBe("resolved");
      expect(anchorOutcome.kind).toBe("resolved");
      if (fileOutcome.kind !== "resolved" || anchorOutcome.kind !== "resolved") return;
      const store = new Map<string, TargetStoreEntry>();
      const register = (target: ResolvedTargetData) =>
        registerWorkflowTarget(store, cwd, {
          file: target.file,
          position: target.position,
          declarationPosition: {
            line: target.declarationAnchor.line - 1,
            character: target.declarationAnchor.character - 1,
          },
          declarationOccurrence: target.declarationOccurrence,
          displayLine: target.displayLine,
          displayCharacter: target.displayCharacter,
          name: target.name,
          kind: target.kind,
          identityKind: target.identityKind,
          confidence: target.confidence,
          provenance: target.provenance,
          anchorKind: target.anchorKind,
          container: target.container,
        });
      const fromFile = fileOutcome.group.targets.find(({ name }) => name === "Intro, overview");
      if (!fromFile) throw new Error("File discovery did not return the section target.");

      expect(fromFile.identityKind).toBe("latex-section");
      expect(register(fromFile).targetId).toBe(register(anchorOutcome.target).targetId);
    } finally {
      await treeSitter.dispose();
    }
  });

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
        position: { line: 3, character: 7 },
        displayLine: 4,
        displayCharacter: 8,
        declarationAnchor: { line: 4, character: 1 },
        anchorKind: "name",
        provenance: ["structural"],
      });
    } finally {
      await treeSitter.dispose();
    }
  });
});
