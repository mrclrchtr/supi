import { basename } from "node:path";
import {
  type CodeRequestControl,
  type CodeResult,
  isCodeRequestInterruption,
  type NodeAtData,
  type StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import type { AnchoredResolutionMetadata } from "../../types/index.ts";
import { resolveLatexTargetAtAnchor } from "./latex-target-anchor.ts";
import type { TargetOutcome } from "./types.ts";

type Anchor = { line: number; character: number };

/** Tree-sitter declaration nodes with names. */
const DECLARATION_NODE_TYPES = new Set([
  "function_declaration",
  "generator_function_declaration",
  "function_signature",
  "method_definition",
  "method_declaration",
  "method_signature",
  "class_declaration",
  "interface_declaration",
  "enum_declaration",
  "type_alias_declaration",
  "lexical_declaration",
  "variable_declaration",
  "export_statement",
]);

/** Tree-sitter nodes that cannot identify a declaration name. */
const NON_SYMBOL_NODE_TYPES = new Set([
  "comment",
  "line_comment",
  "block_comment",
  "string",
  "string_fragment",
  "template_string",
  "template_literal_type",
  "regex",
  "regex_pattern",
  "number",
  "escape_sequence",
]);

function kindFromDeclarationType(nodeType: string): string | null {
  if (nodeType.includes("function")) return "Function";
  if (nodeType.includes("method")) return "Method";
  if (nodeType.includes("class")) return "Class";
  if (nodeType.includes("interface")) return "Interface";
  if (nodeType.includes("enum")) return "Enum";
  if (nodeType.includes("type_alias")) return "Type";
  if (nodeType.includes("lexical") || nodeType.includes("variable")) return "Variable";
  return null;
}

/** Resolve a structural declaration name at one source position. */
export async function resolveFromStructural(
  file: string,
  requested: Anchor,
  provider: Partial<Pick<StructuralProvider, "nodeAt" | "outline">> | null,
  control?: CodeRequestControl,
): Promise<TargetOutcome | null> {
  if (!provider) return null;
  const latexTarget = await resolveLatexTargetAtAnchor({
    file,
    line: requested.line,
    character: requested.character,
    outline: provider.outline,
    control,
  });
  if (latexTarget) return { kind: "resolved", target: latexTarget };
  if (!provider.nodeAt) return null;

  let nodeResult: CodeResult<NodeAtData> | null = null;
  try {
    nodeResult = await provider.nodeAt(file, requested.line, requested.character, control);
  } catch (error) {
    if (isCodeRequestInterruption(error, control)) throw error;
  }
  if (nodeResult?.kind !== "success") return null;

  const node = nodeResult.data;
  const isLabelKey = node.ancestry.some((ancestor) => ancestor.type === "label_definition");
  if (isLabelKey || NON_SYMBOL_NODE_TYPES.has(node.type)) {
    return {
      kind: "error",
      message: coordinateNotOnSymbolMessage(
        file,
        requested,
        isLabelKey ? "unverified LaTeX label key" : node.type,
      ),
    };
  }
  if (node.type !== "identifier") {
    return {
      kind: "error",
      message: coordinateNotOnSymbolMessage(file, requested, node.type),
    };
  }

  const declaration = node.ancestry.find((ancestor) => DECLARATION_NODE_TYPES.has(ancestor.type));
  if (!declaration) {
    return {
      kind: "error",
      message: coordinateNotOnSymbolMessage(file, requested, "identifier usage"),
    };
  }

  const anchor = { line: node.startLine, character: node.startCharacter };
  const declarationAnchor = {
    line: declaration.startLine,
    character: declaration.startCharacter,
  };
  return {
    kind: "resolved",
    target: {
      file,
      position: { line: anchor.line - 1, character: anchor.character - 1 },
      displayLine: anchor.line,
      displayCharacter: anchor.character,
      declarationAnchor,
      declarationOccurrence: 0,
      name: node.text,
      kind: kindFromDeclarationType(declaration.type),
      confidence: "structural",
      provenance: ["structural"],
      anchorKind: "name",
      container: null,
      resolution: {
        requested: { ...requested },
        resolved: anchor,
        snapped: anchor.line !== requested.line || anchor.character !== requested.character,
        source: "structural-identifier",
      } satisfies AnchoredResolutionMetadata,
    },
  };
}

function coordinateNotOnSymbolMessage(file: string, requested: Anchor, detail: string): string {
  const at = `${basename(file)}:${requested.line}:${requested.character}`;
  return (
    `No symbol target resolved at \`${at}\` (on \`${detail}\`). ` +
    "`code_resolve` resolves real symbol targets from provider-backed evidence; " +
    "use `code_inspect` for point-level facts at this coordinate, or pass the identifier coordinate of a declaration."
  );
}
