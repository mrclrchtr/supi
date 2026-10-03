import { extname } from "node:path";
import {
  type CodeRequestControl,
  isCodeRequestInterruption,
  type OutlineData,
  type StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import {
  canonicalFileDeclarationKind,
  type DeclarationOccurrenceCandidate,
  declarationOccurrenceFor,
} from "./identity.ts";
import type { ResolvedTargetData } from "./types.ts";

interface SectionCandidate extends DeclarationOccurrenceCandidate {
  readonly item: OutlineData;
}

/** Resolve an exact LaTeX section title from structural outline evidence. */
export async function resolveLatexSectionTargetAtAnchor(input: {
  readonly file: string;
  readonly line: number;
  readonly character: number;
  readonly outline?: StructuralProvider["outline"];
  readonly control?: CodeRequestControl;
}): Promise<ResolvedTargetData | null> {
  if (!input.outline || !isLatexFile(input.file)) return null;
  try {
    const result = await input.outline(input.file, input.control);
    if (result.kind !== "success") return null;
    const candidates = collectSectionCandidates(input.file, result.data);
    const matches = candidates.filter(({ item }) => {
      const anchor = item.nameAnchor;
      if (!anchor) return false;
      const end = item.nameEndAnchor;
      if (!end) {
        return (
          anchor.line === input.line &&
          input.character >= anchor.character &&
          input.character < anchor.character + item.name.length
        );
      }
      return (
        compareAnchor({ line: input.line, character: input.character }, anchor) >= 0 &&
        compareAnchor({ line: input.line, character: input.character }, end) < 0
      );
    });
    const selected = matches[0];
    if (matches.length !== 1 || !selected?.item.nameAnchor) return null;

    const occurrence = declarationOccurrenceFor(selected, candidates);
    const anchor = selected.item.nameAnchor;
    return {
      file: input.file,
      position: { line: anchor.line - 1, character: anchor.character - 1 },
      displayLine: anchor.line,
      displayCharacter: anchor.character,
      declarationAnchor: {
        line: selected.item.startLine,
        character: selected.item.startCharacter,
      },
      declarationOccurrence: occurrence,
      name: selected.item.name,
      kind: selected.item.kind,
      identityKind: "latex-section",
      confidence: "structural",
      provenance: ["structural"],
      anchorKind: "name",
      container: selected.container,
      resolution: {
        requested: { line: input.line, character: input.character },
        resolved: { line: anchor.line, character: anchor.character },
        snapped: anchor.line !== input.line || anchor.character !== input.character,
        source: "structural",
      },
    };
  } catch (error) {
    if (isCodeRequestInterruption(error, input.control)) throw error;
    return null;
  }
}

function collectSectionCandidates(
  file: string,
  items: readonly OutlineData[],
  container: string | null = null,
): SectionCandidate[] {
  return items.flatMap((item) => {
    const identityKind = canonicalFileDeclarationKind(file, item.kind, item.name);
    const current: SectionCandidate[] =
      identityKind === "latex-section"
        ? [
            {
              item,
              name: item.name,
              identityKind,
              declarationAnchor: { line: item.startLine, character: item.startCharacter },
              nameAnchor: item.nameAnchor ?? null,
              container,
            },
          ]
        : [];
    return [...current, ...collectSectionCandidates(file, item.children ?? [], item.name)];
  });
}

function compareAnchor(
  left: { readonly line: number; readonly character: number },
  right: { readonly line: number; readonly character: number },
): number {
  return left.line - right.line || left.character - right.character;
}

function isLatexFile(file: string): boolean {
  return [".tex", ".sty", ".cls"].includes(extname(file).toLowerCase());
}
