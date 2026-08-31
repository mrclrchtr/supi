import type { SyntaxNodeLike } from "../syntax-node.ts";

/** Extract every identifier bound by one JavaScript or TypeScript pattern. */
export function extractBindingIdentifiers(pattern: SyntaxNodeLike | null): string[] {
  if (!pattern) return [];

  switch (pattern.type) {
    case "identifier":
      return [pattern.text];
    case "shorthand_property_identifier_pattern":
      return [pattern.text];
    case "pair_pattern":
    case "pair":
      return extractBindingIdentifiers(pattern.childForFieldName("value"));
    case "object_assignment_pattern":
    case "assignment_pattern":
      return extractBindingIdentifiers(pattern.childForFieldName("left"));
    case "rest_pattern":
      return pattern.children.flatMap((child) => extractBindingIdentifiers(child));
    case "object_pattern":
    case "array_pattern":
      return pattern.children.flatMap((child) => extractBindingIdentifiers(child));
    default:
      return [];
  }
}
