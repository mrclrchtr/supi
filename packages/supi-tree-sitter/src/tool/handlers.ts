// Per-action handler functions for the focused tree_sitter tool surface.
//
// Each handler receives only the parameters it needs (no action dispatch).
// Handlers are shared between the extension factory (tree-sitter.ts) and the
// tool registration layer (register-tools.ts).

import { detectGrammar, isJsTsGrammar } from "../language.ts";
import type { TreeSitterRuntime } from "../session/runtime.ts";
import {
  formatNonSuccess,
  formatOutlineItemsCapped,
  MAX_ITEMS,
  truncate,
  truncatedNotice,
  truncateText,
} from "./formatting.ts";
import { collectOutline } from "./outline.ts";
import { extractExports, extractImports, lookupCalleesAt, lookupNodeAt } from "./structure.ts";

// ---------------------------------------------------------------------------
// Outline — JS/TS only
// ---------------------------------------------------------------------------

export async function handleOutline(runtime: TreeSitterRuntime, file: string): Promise<string> {
  const parseResult = await runtime.parseFile(file);
  if (parseResult.kind !== "success") return formatNonSuccess(parseResult);
  if (!isJsTsGrammar(parseResult.data.grammarId)) {
    return "Unsupported language: outline is only supported for JavaScript and TypeScript files";
  }

  const { tree, source } = parseResult.data;
  let items: ReturnType<typeof collectOutline>;
  try {
    items = collectOutline(tree.rootNode, source);
  } finally {
    tree.delete();
  }

  if (items.length === 0) return `No structural declarations found in ${file}`;

  const lines = [`## Outline: ${file}`, ""];
  const { omitted } = formatOutlineItemsCapped(items, lines, MAX_ITEMS);
  if (omitted) lines.push("", truncatedNotice(omitted, "outline items"));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Imports — JS/TS only
// ---------------------------------------------------------------------------

export async function handleImports(runtime: TreeSitterRuntime, file: string): Promise<string> {
  const grammarId = detectGrammar(file);
  if (grammarId && !isJsTsGrammar(grammarId)) {
    return "Unsupported language: imports is only supported for JavaScript and TypeScript files";
  }
  const result = await extractImports(runtime, file);
  if (result.kind !== "success") return formatNonSuccess(result);

  const { data: imports } = result;
  if (imports.length === 0) return `No imports found in ${file}`;

  const { included, truncated } = truncate(imports, MAX_ITEMS);
  const lines = [`## Imports: ${file}`, ""];
  for (const imp of included) {
    const r = imp.range;
    lines.push(`- "${imp.moduleSpecifier}" (L${r.startLine}:${r.startCharacter})`);
  }
  if (truncated) lines.push("", truncatedNotice(truncated, "imports"));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Exports — JS/TS only
// ---------------------------------------------------------------------------

export async function handleExports(runtime: TreeSitterRuntime, file: string): Promise<string> {
  const grammarId = detectGrammar(file);
  if (grammarId && !isJsTsGrammar(grammarId)) {
    return "Unsupported language: exports is only supported for JavaScript and TypeScript files";
  }
  const result = await extractExports(runtime, file);
  if (result.kind !== "success") return formatNonSuccess(result);

  const { data: exports } = result;
  if (exports.length === 0) return `No exports found in ${file}`;

  const { included, truncated } = truncate(exports, MAX_ITEMS);
  const lines = [`## Exports: ${file}`, ""];
  for (const exp of included) {
    const r = exp.range;
    const from = exp.moduleSpecifier ? ` from "${exp.moduleSpecifier}"` : "";
    lines.push(`- ${exp.kind}: ${exp.name}${from} (L${r.startLine}:${r.startCharacter})`);
  }
  if (truncated) lines.push("", truncatedNotice(truncated, "exports"));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Node at position — all supported grammars
// ---------------------------------------------------------------------------

export async function handleNodeAt(
  runtime: TreeSitterRuntime,
  file: string,
  line: number,
  character: number,
): Promise<string> {
  const result = await lookupNodeAt(runtime, file, line, character);
  if (result.kind !== "success") return formatNonSuccess(result);

  const { data } = result;
  const lines = [
    `## Node at ${file}:${line}:${character}`,
    "",
    `**Type:** ${data.type}`,
    `**Range:** L${data.range.startLine}:${data.range.startCharacter} — L${data.range.endLine}:${data.range.endCharacter}`,
    `**Text:** ${truncateText(data.text, 200)}`,
  ];

  if (data.ancestry.length > 0) {
    lines.push("", "**Ancestry:**");
    const { included, truncated } = truncate(data.ancestry, MAX_ITEMS);
    for (const ancestor of included) {
      lines.push(
        `- ${ancestor.type} (L${ancestor.range.startLine}:${ancestor.range.startCharacter}-L${ancestor.range.endLine}:${ancestor.range.endCharacter})`,
      );
    }
    if (truncated) lines.push("", truncatedNotice(truncated, "ancestry entries"));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Query — all supported grammars
// ---------------------------------------------------------------------------

export async function handleQuery(
  runtime: TreeSitterRuntime,
  file: string,
  query: string,
): Promise<string> {
  const result = await runtime.queryFile(file, query);
  if (result.kind !== "success") return formatNonSuccess(result);

  const { data: captures } = result;
  if (captures.length === 0) return `No matches for query in ${file}`;

  const { included, truncated } = truncate(captures, MAX_ITEMS);
  const lines = [`## Query results: ${file}`, ""];
  for (const capture of included) {
    const r = capture.range;
    lines.push(
      `- ${capture.name}: ${capture.nodeType} (L${r.startLine}:${r.startCharacter}-L${r.endLine}:${r.endCharacter})`,
    );
    lines.push(`  \`${truncateText(capture.text, 120)}\``);
  }
  if (truncated) lines.push("", truncatedNotice(truncated, "captures"));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Callees — many supported grammars
// ---------------------------------------------------------------------------

export async function handleCallees(
  runtime: TreeSitterRuntime,
  file: string,
  line: number,
  character: number,
): Promise<string> {
  const result = await lookupCalleesAt(runtime, file, line, character);
  if (result.kind !== "success") return formatNonSuccess(result);

  const { enclosingScope, callees } = result.data;
  if (callees.length === 0) {
    return `No outgoing calls found in \`${enclosingScope.name}\` at ${file}:${line}:${character}`;
  }

  const lines: string[] = [];
  lines.push(`## Callees: ${file}:${line}:${character}`);
  lines.push("");
  lines.push(
    `**${callees.length} outgoing call${callees.length > 1 ? "s" : ""}** from \`${enclosingScope.name}\` at L${enclosingScope.range.startLine}-L${enclosingScope.range.endLine}`,
  );
  lines.push("");

  for (const c of callees.slice(0, MAX_ITEMS)) {
    lines.push(`- \`${c.name}\` (L${c.range.startLine})`);
  }
  if (callees.length > MAX_ITEMS) {
    lines.push("", truncatedNotice(callees.length - MAX_ITEMS, "callees"));
  }

  return lines.join("\n");
}
