import { extname } from "node:path";
import {
  type CodeRequestControl,
  isCodeRequestInterruption,
  type OutlineData,
  type StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import {
  canonicalDeclarationKind,
  canonicalFileDeclarationKind,
  type DeclarationOccurrenceCandidate,
  declarationOccurrenceFor,
} from "./identity.ts";
import type { ResolvedTargetData, TargetOutcome } from "./types.ts";

type LabelOutlineCandidate = DeclarationOccurrenceCandidate & {
  readonly name: string;
  readonly nameAnchor: { readonly line: number; readonly character: number } | null;
};

export interface LatexLabelIdentity {
  readonly name: string;
  readonly declarationAnchor: { readonly line: number; readonly character: number };
  readonly nameAnchor: { readonly line: number; readonly character: number };
  readonly container: string | null;
  readonly declarationOccurrence: number;
}

function collectLabelCandidates(
  items: readonly OutlineData[],
  container: string | null = null,
): LabelOutlineCandidate[] {
  return items.flatMap((item) => {
    const isLabel = item.kind.toLowerCase() === "label";
    const candidates: LabelOutlineCandidate[] = isLabel
      ? [
          {
            name: item.name,
            identityKind: canonicalDeclarationKind(item.kind),
            declarationAnchor: { line: item.startLine, character: item.startCharacter },
            nameAnchor: item.nameAnchor ?? null,
            container,
          },
        ]
      : [];
    return [...candidates, ...collectLabelCandidates(item.children ?? [], item.name)];
  });
}

/** Find a complete label key at one source coordinate. */
export async function findLatexLabelAtAnchor(input: {
  file: string;
  line: number;
  character: number;
  outline?: StructuralProvider["outline"];
  control?: CodeRequestControl;
}): Promise<LatexLabelIdentity | null> {
  if (!input.outline || ![".tex", ".sty", ".cls"].includes(extname(input.file).toLowerCase())) {
    return null;
  }
  try {
    const result = await input.outline(input.file, input.control);
    if (result.kind !== "success") return null;
    const candidates = collectLabelCandidates(result.data);
    const selected = candidates.find((candidate) => {
      const anchor = candidate.nameAnchor;
      return (
        anchor !== null &&
        anchor.line === input.line &&
        input.character >= anchor.character &&
        input.character < anchor.character + candidate.name.length
      );
    });
    if (!selected?.nameAnchor) return null;
    return {
      name: selected.name,
      declarationAnchor: selected.declarationAnchor,
      nameAnchor: selected.nameAnchor,
      container: selected.container,
      declarationOccurrence: declarationOccurrenceFor(selected, candidates),
    };
  } catch (error) {
    if (isCodeRequestInterruption(error, input.control)) throw error;
    return null;
  }
}

/** Resolve a label key at an exact source character. */
export async function resolveLatexLabelTargetAtAnchor(input: {
  file: string;
  line: number;
  character: number;
  outline?: StructuralProvider["outline"];
  control?: CodeRequestControl;
}): Promise<ResolvedTargetData | null> {
  const label = await findLatexLabelAtAnchor(input);
  if (!label) return null;
  const anchor = label.nameAnchor;
  return {
    file: input.file,
    position: { line: anchor.line - 1, character: anchor.character - 1 },
    displayLine: anchor.line,
    displayCharacter: anchor.character,
    declarationAnchor: label.declarationAnchor,
    declarationOccurrence: label.declarationOccurrence,
    name: label.name,
    kind: "label",
    identityKind: canonicalDeclarationKind("label"),
    confidence: "structural",
    provenance: ["structural"],
    anchorKind: "name",
    container: label.container,
    resolution: {
      requested: { line: input.line, character: input.character },
      resolved: { line: anchor.line, character: anchor.character },
      snapped: anchor.line !== input.line || anchor.character !== input.character,
      source: "structural-identifier",
    },
  };
}

/** Accept a structural label only when it disproves a Texlab section-name hit. */
export async function resolveTexlabSectionLabelCollision(
  file: string,
  semantic: TargetOutcome,
  resolveStructural: () => Promise<TargetOutcome | null>,
): Promise<TargetOutcome | null> {
  if (
    semantic.kind !== "resolved" ||
    canonicalFileDeclarationKind(file, semantic.target.kind, semantic.target.name) !==
      "latex-section"
  ) {
    return null;
  }
  const structural = await resolveStructural();
  return structural?.kind === "resolved" && structural.target.kind === "label" ? structural : null;
}
