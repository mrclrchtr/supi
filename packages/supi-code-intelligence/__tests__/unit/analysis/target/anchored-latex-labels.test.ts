import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { unavailableCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import { afterEach, describe, expect, it } from "vitest";
import { resolveAnchoredSymbolTarget } from "../../../../src/analysis/target/anchored.ts";
import { resolveFileTargetGroup } from "../../../../src/analysis/target/file.ts";
import { canonicalDeclarationKind } from "../../../../src/analysis/target/identity.ts";
import type { ResolvedTargetData } from "../../../../src/analysis/target/types.ts";
import {
  registerWorkflowTarget,
  type TargetStoreEntry,
} from "../../../../src/session/target-store.ts";

let cwd: string;

afterEach(() => {
  if (cwd) rmSync(cwd, { recursive: true, force: true });
});

describe("anchored LaTeX labels", () => {
  it("keeps same-line duplicate labels aligned with file discovery identity", async () => {
    cwd = mkdtempSync(path.join(os.tmpdir(), "latex-duplicate-labels-"));
    const file = path.join(cwd, "paper.tex");
    writeFileSync(file, String.raw`\label{dup}\label{dup}`);
    const treeSitter = createTreeSitterSession(cwd);
    const structural = createTreeSitterProvider(treeSitter);

    try {
      const discovered = await resolveFileTargetGroup(file, cwd, { structural });
      expect(discovered.kind).toBe("resolved");
      if (discovered.kind !== "resolved") return;
      const fileTargets = discovered.group.targets.filter(({ name }) => name === "dup");
      expect(fileTargets.map(({ declarationOccurrence }) => declarationOccurrence)).toEqual([0, 1]);
      expect(
        fileTargets.map(({ declarationAnchor, displayCharacter }) => [
          declarationAnchor.character,
          displayCharacter,
        ]),
      ).toEqual([
        [1, 8],
        [12, 19],
      ]);

      const provider = {
        documentSymbols: async () =>
          unavailableCodeQuery("Texlab unavailable for duplicate labels"),
        nodeAt: structural.nodeAt.bind(structural),
        outline: structural.outline.bind(structural),
      };
      const store = new Map<string, TargetStoreEntry>();
      const registeredFileTargets = fileTargets.map((target) => register(cwd, store, target));
      const anchoredTargets = await Promise.all(
        fileTargets.map(async (target) => {
          const result = await resolveAnchoredSymbolTarget(
            file,
            target.displayLine,
            target.displayCharacter,
            provider,
          );
          expect(result.kind).toBe("resolved");
          if (result.kind !== "resolved") throw new Error("The label anchor did not resolve.");
          expect(result.target.declarationAnchor).toEqual(target.declarationAnchor);
          expect(result.target.declarationOccurrence).toBe(target.declarationOccurrence);
          return register(cwd, store, result.target);
        }),
      );

      expect(anchoredTargets.map(({ targetId }) => targetId)).toEqual(
        registeredFileTargets.map(({ targetId }) => targetId),
      );
      expect(new Set(anchoredTargets.map(({ targetId }) => targetId)).size).toBe(2);
    } finally {
      await treeSitter.dispose();
    }
  });

  it("uses the full underscore key for file and anchored target identity", async () => {
    cwd = mkdtempSync(path.join(os.tmpdir(), "latex-underscore-label-"));
    const file = path.join(cwd, "paper.tex");
    writeFileSync(file, String.raw`\label{sec:my_label}`);
    const treeSitter = createTreeSitterSession(cwd);
    const structural = createTreeSitterProvider(treeSitter);
    const store = new Map<string, TargetStoreEntry>();

    try {
      const discovered = await resolveFileTargetGroup(file, cwd, { structural });
      expect(discovered.kind).toBe("resolved");
      if (discovered.kind !== "resolved") return;
      const fileTarget = discovered.group.targets.find(({ name }) => name === "sec:my_label");
      expect(fileTarget).toMatchObject({
        name: "sec:my_label",
        displayLine: 1,
        displayCharacter: 8,
      });
      if (!fileTarget) return;
      const fileTargetId = register(cwd, store, fileTarget).targetId;
      const provider = {
        documentSymbols: async () => unavailableCodeQuery("Texlab unavailable for label anchor"),
        nodeAt: structural.nodeAt.bind(structural),
        outline: structural.outline.bind(structural),
      };

      for (const character of [8, 14, 19]) {
        const result = await resolveAnchoredSymbolTarget(file, 1, character, provider);
        expect(result.kind).toBe("resolved");
        if (result.kind !== "resolved") continue;
        expect(result.target).toMatchObject({
          name: "sec:my_label",
          displayLine: 1,
          displayCharacter: 8,
          declarationAnchor: { line: 1, character: 1 },
        });
        expect(register(cwd, store, result.target).targetId).toBe(fileTargetId);
      }
    } finally {
      await treeSitter.dispose();
    }
  });
});

function register(cwd: string, store: Map<string, TargetStoreEntry>, target: ResolvedTargetData) {
  return registerWorkflowTarget(store, cwd, {
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
    identityKind: target.identityKind ?? canonicalDeclarationKind(target.kind),
    confidence: target.confidence,
    provenance: target.provenance,
    anchorKind: target.anchorKind,
    container: target.container,
  });
}
