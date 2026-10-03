import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import { afterEach, describe, expect, it } from "vitest";
import { refineLatexSectionRenameResult } from "../../../../src/analysis/refactor/latex-section-rename.ts";
import {
  computeFileFingerprint,
  type TargetStoreEntry,
} from "../../../../src/session/target-store.ts";

let cwd: string;
let treeSitter: ReturnType<typeof createTreeSitterSession> | undefined;

afterEach(async () => {
  await treeSitter?.dispose();
  treeSitter = undefined;
  if (cwd) rmSync(cwd, { recursive: true, force: true });
});

describe("LaTeX section rename planning", () => {
  it("rejects a provider edit that changes the associated label instead of the title", async () => {
    const { file, target } = createFixture();
    treeSitter = createTreeSitterSession(cwd);
    const result = await refineLatexSectionRenameResult({
      operation: "rename_symbol",
      result: {
        kind: "precise",
        edits: {
          edits: [
            {
              file,
              range: {
                start: { line: 3, character: 7 },
                end: { line: 3, character: 16 },
              },
              newText: "NewHeading",
            },
          ],
        },
        authorizedMutationRoots: [cwd],
      },
      target,
      file,
      newName: "NewHeading",
      structural: createTreeSitterProvider(treeSitter),
      documentVersionReader: () => 1,
    });

    expect(result).toMatchObject({
      evidenceSource: "semantic",
      result: {
        kind: "unavailable",
        reason:
          "The LSP rename did not return one edit for the exact section title. No rename was planned.",
      },
    });
  });

  it("rejects mixed-content titles and preserves an inline label", async () => {
    const { file, target: oldTarget } = createFixture();
    const source = String.raw`\section{Intro\label{sec:intro}}`;
    writeFileSync(file, source);
    const target = {
      ...oldTarget,
      displayLine: 1,
      displayCharacter: 10,
      declarationPosition: { line: 0, character: 0 },
      name: String.raw`Intro\label{sec:intro}`,
      fileFingerprint: fingerprintOf(file),
    };
    treeSitter = createTreeSitterSession(cwd);
    const result = await refineLatexSectionRenameResult({
      operation: "rename_symbol",
      result: {
        kind: "unavailable",
        reason: UNSUPPORTED_RENAME_REASON,
        authorizedMutationRoots: [cwd],
      },
      target,
      file,
      newName: "Overview",
      structural: createTreeSitterProvider(treeSitter),
      documentVersionReader: () => null,
    });

    expect(result.result.kind).toBe("unavailable");
    expect(readFileSync(file, "utf8")).toBe(source);
  });

  it("rejects TeX control characters and missing routed authority", async () => {
    const { file, target } = createFixture();
    treeSitter = createTreeSitterSession(cwd);
    const structural = createTreeSitterProvider(treeSitter);
    const unsupported = { kind: "unavailable" as const, reason: UNSUPPORTED_RENAME_REASON };
    const unsafeName = await refineLatexSectionRenameResult({
      operation: "rename_symbol",
      result: { ...unsupported, authorizedMutationRoots: [cwd] },
      target,
      file,
      newName: String.raw`\input{other}`,
      structural,
      documentVersionReader: () => 1,
    });
    const unsupportedShape = await refineLatexSectionRenameResult({
      operation: "rename_symbol",
      result: { ...unsupported, authorizedMutationRoots: [cwd] },
      target,
      file,
      newName: "[Overview]",
      structural,
      documentVersionReader: () => 1,
    });
    const noAuthority = await refineLatexSectionRenameResult({
      operation: "rename_symbol",
      result: unsupported,
      target,
      file,
      newName: "Overview",
      structural,
      documentVersionReader: () => 1,
    });

    expect(unsafeName.result).toMatchObject({ kind: "unavailable", reason: /plain-text/u });
    expect(unsupportedShape.result).toMatchObject({
      kind: "unavailable",
      reason: /supported by the parser/u,
    });
    expect(noAuthority.result).toMatchObject({
      kind: "unavailable",
      reason: /did not authorize a mutation root/u,
    });
  });
});

const UNSUPPORTED_RENAME_REASON =
  "LSP request textDocument/rename failed: Rename is unavailable at the requested position.";

function createFixture(): { file: string; target: TargetStoreEntry } {
  cwd = mkdtempSync(path.join(os.tmpdir(), "latex-section-rename-"));
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
  return {
    file,
    target: {
      targetId: "target-heading",
      spanId: "span-heading",
      file,
      position: { line: 2, character: 9 },
      declarationPosition: { line: 2, character: 0 },
      declarationOccurrence: 0,
      displayLine: 3,
      displayCharacter: 10,
      name: "Intro",
      kind: "Module",
      confidence: "semantic",
      provenance: ["semantic", "structural"],
      anchorKind: "name",
      fileFingerprint: fingerprintOf(file),
      container: null,
    },
  };
}

function fingerprintOf(file: string): string {
  const result = computeFileFingerprint(file);
  if (result.kind !== "ok") throw new Error("Could not fingerprint the fixture.");
  return result.fingerprint;
}
