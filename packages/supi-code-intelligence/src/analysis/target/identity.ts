/**
 * Normalize provider-specific declaration kinds into stable identity families.
 * Display kinds remain untouched; this value is used only for matching and
 * target-handle identity across semantic/structural observations.
 */
export function canonicalDeclarationKind(kind: string | null): string {
  const normalized = (kind ?? "").toLowerCase();
  if (
    ["function", "variable", "constant", "field", "field-function", "property"].includes(normalized)
  ) {
    return "value";
  }
  if (["method", "constructor"].includes(normalized)) return "member";
  return normalized;
}
