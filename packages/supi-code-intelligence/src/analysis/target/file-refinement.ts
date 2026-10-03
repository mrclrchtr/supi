import type { DiscoveredTargetData } from "./file.ts";
import { canonicalFileDeclarationKind } from "./identity.ts";

/** Refine a LaTeX section anchor with exact structural title evidence. */
export function refineLatexSectionNameAnchor(
  semantic: DiscoveredTargetData,
  structural: DiscoveredTargetData,
): DiscoveredTargetData {
  if (
    canonicalFileDeclarationKind(semantic.file, semantic.kind, semantic.name) !== "latex-section" ||
    canonicalFileDeclarationKind(structural.file, structural.kind, structural.name) !==
      "latex-section" ||
    semantic.name !== structural.name
  ) {
    return semantic;
  }

  return {
    ...semantic,
    position: { ...structural.position },
    displayLine: structural.displayLine,
    displayCharacter: structural.displayCharacter,
    anchorKind: structural.anchorKind,
  };
}

/** Prefer known hierarchy, but keep conflicts unknown. */
export function reconcileNesting(
  semantic: DiscoveredTargetData["nesting"],
  structural: DiscoveredTargetData["nesting"],
): DiscoveredTargetData["nesting"] {
  if (semantic === structural) return semantic;
  if (semantic === "unknown") return structural;
  if (structural === "unknown") return semantic;
  return "unknown";
}

/** Keep container metadata unless both providers report conflicting known facts. */
export function reconcileContainer(
  semantic: DiscoveredTargetData,
  structural: DiscoveredTargetData,
): string | null {
  if (semantic.container === structural.container) return semantic.container;
  if (semantic.nesting === "unknown" && semantic.container === null) {
    return structural.container;
  }
  if (structural.nesting === "unknown" && structural.container === null) {
    return semantic.container;
  }
  return null;
}
