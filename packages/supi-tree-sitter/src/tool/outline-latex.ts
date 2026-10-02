import { nodeToRange } from "../coordinates.ts";
import type { SyntaxNodeLike } from "../syntax-node.ts";
import type { OutlineItem } from "../types.ts";

const LATEX_SECTION_KINDS: Readonly<Record<string, string>> = {
  part: "part",
  chapter: "chapter",
  section: "section",
  subsection: "subsection",
  subsubsection: "subsubsection",
  paragraph: "paragraph",
  subparagraph: "subparagraph",
};

const LATEX_DEFINITION_FIELDS: Readonly<Record<string, { field: string; kind: string }>> = {
  new_command_definition: { field: "declaration", kind: "command" },
  old_command_definition: { field: "declaration", kind: "command" },
  let_command_definition: { field: "declaration", kind: "command" },
  paired_delimiter_definition: { field: "declaration", kind: "command" },
  environment_definition: { field: "name", kind: "environment" },
  label_definition: { field: "name", kind: "label" },
  acronym_definition: { field: "name", kind: "acronym" },
  glossary_entry_definition: { field: "name", kind: "glossary-entry" },
  color_definition: { field: "name", kind: "color" },
};

/** Extract LaTeX section headings and explicit definitions from grammar nodes. */
export function extractLatexOutlineItems(
  node: SyntaxNodeLike,
  source: string,
): OutlineItem[] | undefined {
  const sectionKind = LATEX_SECTION_KINDS[node.type];
  if (sectionKind) {
    const title = node.childForFieldName("text");
    const name = title ? groupContent(title.text) : "";
    if (!name) return [];
    return [
      {
        name,
        kind: sectionKind,
        range: nodeToRange(node, source),
        children: collectLatexMembers(node, source),
      },
    ];
  }

  const definition = LATEX_DEFINITION_FIELDS[node.type];
  if (!definition) return undefined;
  const declaration = node.childForFieldName(definition.field);
  const name = declaration ? groupContent(declaration.text) : "";
  return name ? [{ name, kind: definition.kind, range: nodeToRange(node, source) }] : [];
}

function collectLatexMembers(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  for (const child of node.children) {
    const sectionKind = LATEX_SECTION_KINDS[child.type];
    if (sectionKind) {
      items.push(...(extractLatexOutlineItems(child, source) ?? []));
      continue;
    }

    const definition = LATEX_DEFINITION_FIELDS[child.type];
    if (definition) {
      items.push(...(extractLatexOutlineItems(child, source) ?? []));
      continue;
    }
    items.push(...collectLatexMembers(child, source));
  }
  return items;
}

function groupContent(value: string): string {
  const trimmed = value.trim();
  const contents =
    trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed.slice(1, -1) : trimmed;
  return contents.replace(/\s+/g, " ").trim();
}
