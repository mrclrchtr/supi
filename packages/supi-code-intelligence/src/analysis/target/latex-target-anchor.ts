import type { CodeRequestControl, StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";
import { resolveLatexLabelTargetAtAnchor } from "./latex-label-container.ts";
import { resolveLatexSectionTargetAtAnchor } from "./latex-section-anchor.ts";
import type { ResolvedTargetData } from "./types.ts";

/** Resolve a LaTeX label or section title at one source coordinate. */
export async function resolveLatexTargetAtAnchor(input: {
  readonly file: string;
  readonly line: number;
  readonly character: number;
  readonly outline?: StructuralProvider["outline"];
  readonly control?: CodeRequestControl;
}): Promise<ResolvedTargetData | null> {
  const label = await resolveLatexLabelTargetAtAnchor(input);
  if (label) return label;
  return resolveLatexSectionTargetAtAnchor(input);
}
