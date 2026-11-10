import type { DeclarationLevel } from "./types.ts";

/** Declarations whose body holds statements, so nested declarations are local to it. */
const FUNCTION_LIKE_KINDS = new Set(["function", "method", "constructor"]);
/** Bindings whose value may be a function (locals) or an object literal (members). */
const VALUE_BINDING_KINDS = new Set(["variable", "constant", "property", "field"]);
/** Kinds that name an entry of an object, type, or enum rather than a statement-level binding. */
const MEMBER_ENTRY_KINDS = new Set(["property", "field", "method", "enummember", "key", "event"]);

/**
 * Level of a declaration reported directly inside `parent`.
 *
 * Inside a local declaration everything stays local. A function, method, or
 * constructor makes its nested declarations local. A variable, constant,
 * property, or field holds either a function body (nested bindings are local)
 * or an object literal (nested properties and methods are members). Every
 * other container — class, interface, enum, struct, namespace, module, or a
 * document section — makes its nested declarations members.
 *
 * Kinds compare case-insensitively, so LSP SymbolKind names and Tree-sitter
 * outline kinds share one rule.
 */
export function childDeclarationLevel(
  parent: { readonly kind: string | null; readonly level: DeclarationLevel },
  childKind: string | null,
): Exclude<DeclarationLevel, "top-level" | "unknown"> {
  if (parent.level === "local") return "local";
  const parentKind = parent.kind?.toLowerCase() ?? "";
  if (FUNCTION_LIKE_KINDS.has(parentKind)) return "local";
  if (VALUE_BINDING_KINDS.has(parentKind)) {
    return MEMBER_ENTRY_KINDS.has(childKind?.toLowerCase() ?? "") ? "member" : "local";
  }
  return "member";
}
