/**
 * File outline merge: pair the language server's and the syntax parser's
 * observations of one declaration, then order the outline.
 */

import type { DiscoveredTargetData } from "./file.ts";
import {
  reconcileContainer,
  reconcileLevel,
  refineLatexSectionNameAnchor,
} from "./file-refinement.ts";
import {
  canonicalDeclarationKind,
  canonicalFileDeclarationKind,
  canonicalFileDeclarationName,
  declarationOccurrencesFor,
} from "./identity.ts";
import type { ResolvedTargetData } from "./types.ts";

/**
 * Merge duplicate provider observations without collapsing repeated declarations.
 * Semantic facts win a matched pair while retaining both provider sources.
 */
export function mergeDiscoveries(
  structural: readonly DiscoveredTargetData[],
  semantic: readonly DiscoveredTargetData[],
): DiscoveredTargetData[] {
  const unmatchedSemantic = new Set(semantic.map((_target, index) => index));
  const mergedStructural = structural.flatMap((structuralTarget) => {
    const semanticIndex = findSemanticMatch(structuralTarget, semantic, unmatchedSemantic);
    if (semanticIndex === null) return [structuralTarget];
    unmatchedSemantic.delete(semanticIndex);
    const semanticTarget = semantic[semanticIndex];
    const refinedSemantic = refineLatexSectionNameAnchor(semanticTarget, structuralTarget);
    return [
      {
        ...refinedSemantic,
        provenance: ["semantic", "structural"] as const,
        nativeKind: structuralTarget.nativeKind ?? semanticTarget.nativeKind,
        container: reconcileContainer(semanticTarget, structuralTarget),
        level: reconcileLevel(semanticTarget.level, structuralTarget.level),
      },
    ];
  });
  const semanticOnly = semantic.filter((_target, index) => unmatchedSemantic.has(index));
  const sourceOrdered = [...mergedStructural, ...semanticOnly].sort(compareDeclarations);
  const identified = assignDeclarationOccurrences(sourceOrdered);
  return identified.sort(compareFileOrientationDeclarations);
}

function findSemanticMatch(
  structural: DiscoveredTargetData,
  semantic: readonly DiscoveredTargetData[],
  unmatched: ReadonlySet<number>,
): number | null {
  const matches = semantic
    .map((target, index) => ({ target, index }))
    .filter(({ target, index }) => unmatched.has(index) && sameDeclaration(target, structural))
    .sort(
      (left, right) =>
        Math.abs(left.target.declarationAnchor.character - structural.declarationAnchor.character) -
          Math.abs(
            right.target.declarationAnchor.character - structural.declarationAnchor.character,
          ) ||
        left.target.declarationAnchor.character - right.target.declarationAnchor.character ||
        compareDeclarations(left.target, right.target) ||
        (left.target.container ?? "").localeCompare(right.target.container ?? "") ||
        left.target.level.localeCompare(right.target.level) ||
        left.index - right.index,
    );
  return matches[0]?.index ?? null;
}

function sameDeclaration(
  semantic: DiscoveredTargetData,
  structural: DiscoveredTargetData,
): boolean {
  return (
    canonicalFileDeclarationName(semantic.file, semantic.kind, semantic.name) ===
      canonicalFileDeclarationName(structural.file, structural.kind, structural.name) &&
    compatibleContainerEvidence(semantic, structural) &&
    sameDeclarationLine(semantic, structural) &&
    declarationIdentityKind(semantic) === declarationIdentityKind(structural)
  );
}

/**
 * Both providers start the declaration on one line, or the language server's
 * range also covers leading decorators (Python, for example) while its name
 * sits on the line where the syntax parser starts the declaration.
 */
function sameDeclarationLine(
  semantic: DiscoveredTargetData,
  structural: DiscoveredTargetData,
): boolean {
  const line = structural.declarationAnchor.line;
  return (
    semantic.declarationAnchor.line === line ||
    (semantic.anchorKind === "name" &&
      semantic.declarationAnchor.line < line &&
      semantic.displayLine === line)
  );
}

/** Container conflicts match only when both providers report the exact declaration anchor. */
function compatibleContainerEvidence(
  left: DiscoveredTargetData,
  right: DiscoveredTargetData,
): boolean {
  return (
    left.container === right.container ||
    left.declarationAnchor.character === right.declarationAnchor.character
  );
}

function assignDeclarationOccurrences(
  targets: readonly DiscoveredTargetData[],
): DiscoveredTargetData[] {
  const candidates = targets.map((target) => ({
    name: target.name,
    identityKind: declarationIdentityKind(target),
    declarationAnchor: target.declarationAnchor,
    nameAnchor: { line: target.displayLine, character: target.displayCharacter },
    container: target.container,
  }));
  const occurrences = declarationOccurrencesFor(candidates);
  return targets.map((target, index) => {
    const declarationOccurrence = occurrences[index];
    if (declarationOccurrence === undefined) {
      throw new Error("The declaration occurrence was not assigned.");
    }
    return { ...target, declarationOccurrence };
  });
}

function declarationIdentityKind(target: ResolvedTargetData): string {
  return (
    target.identityKind ??
    canonicalFileDeclarationKind(target.file, target.kind, target.name) ??
    canonicalDeclarationKind(target.kind)
  );
}

function compareFileOrientationDeclarations(
  left: DiscoveredTargetData,
  right: DiscoveredTargetData,
): number {
  return topLevelRank(left) - topLevelRank(right) || compareDeclarations(left, right);
}

function topLevelRank(target: DiscoveredTargetData): number {
  return target.level === "top-level" ? 0 : 1;
}

function compareDeclarations(left: ResolvedTargetData, right: ResolvedTargetData): number {
  return (
    left.displayLine - right.displayLine ||
    left.displayCharacter - right.displayCharacter ||
    (left.name ?? "").localeCompare(right.name ?? "") ||
    (left.kind ?? "").localeCompare(right.kind ?? "")
  );
}
