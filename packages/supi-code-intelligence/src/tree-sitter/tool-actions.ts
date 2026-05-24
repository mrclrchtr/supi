// Tree-sitter tool actions — service-backed execution helpers for the umbrella adapter.
//
// These consume the public `@mrclrchtr/supi-tree-sitter/api` surface and
// format results for model consumption.

import type { ExportRecord, TreeSitterService } from "@mrclrchtr/supi-tree-sitter/api";

const MAX_ITEMS = 200;

function formatNonSuccess(result: { kind: string; message?: string }): string {
  switch (result.kind) {
    case "unsupported-language":
      return `Unsupported language: ${result.message}`;
    case "file-access-error":
      return `File access error: ${result.message}`;
    case "validation-error":
      return `Validation error: ${result.message}`;
    case "runtime-error":
      return `Runtime error: ${result.message}`;
    default:
      return `Error: ${result.message ?? "unknown error"}`;
  }
}

// ── Outline ──────────────────────────────────────────────────────────

export async function executeOutline(service: TreeSitterService, file: string): Promise<string> {
  const result = await service.outline(file);
  if (result.kind !== "success") return formatNonSuccess(result);

  const items = result.data;
  if (items.length === 0) return `No structural declarations found in ${file}`;

  const lines = [`## Outline: ${file}`, ""];
  const { included, omitted } = capItems(items, MAX_ITEMS);
  for (const item of included) {
    lines.push(`- ${item.kind} **${item.name}** (L${item.range.startLine})`);
  }
  if (omitted) lines.push("", `... and ${omitted} more items`);
  return lines.join("\n");
}

// ── Imports ──────────────────────────────────────────────────────────

export async function executeImports(service: TreeSitterService, file: string): Promise<string> {
  const result = await service.imports(file);
  if (result.kind !== "success") return formatNonSuccess(result);

  const imports = result.data;
  if (imports.length === 0) return `No imports found in ${file}`;

  const { included, omitted } = capItems(imports, MAX_ITEMS);
  const lines = [`## Imports: ${file}`, ""];
  for (const imp of included) {
    lines.push(`- "${imp.moduleSpecifier}" (L${imp.range.startLine}:${imp.range.startCharacter})`);
  }
  if (omitted) lines.push("", `... and ${omitted} more imports`);
  return lines.join("\n");
}

// ── Exports ──────────────────────────────────────────────────────────

export async function executeExports(service: TreeSitterService, file: string): Promise<string> {
  const result = await service.exports(file);
  if (result.kind !== "success") return formatNonSuccess(result);

  const exports: ExportRecord[] = result.data;
  if (exports.length === 0) return `No exports found in ${file}`;

  const { included, omitted } = capItems(exports, MAX_ITEMS);
  const lines = [`## Exports: ${file}`, ""];
  for (const exp of included) {
    const spec = exp.moduleSpecifier ? ` from "${exp.moduleSpecifier}"` : "";
    lines.push(`- ${exp.kind} **${exp.name}**${spec}`);
  }
  if (omitted) lines.push("", `... and ${omitted} more exports`);
  return lines.join("\n");
}

// ── Node At ──────────────────────────────────────────────────────────

export async function executeNodeAt(
  service: TreeSitterService,
  file: string,
  line: number,
  character: number,
): Promise<string> {
  const result = await service.nodeAt(file, line, character);
  if (result.kind !== "success") return formatNonSuccess(result);

  const node = result.data;
  const lines = [`## Node at ${file}:${line}:${character}`, ""];
  lines.push(`Type: \`${node.type}\``);
  lines.push(`Text: \`${truncateStr(node.text, 200)}\``);
  lines.push(
    `Range: L${node.range.startLine}:${node.range.startCharacter} - L${node.range.endLine}:${node.range.endCharacter}`,
  );
  lines.push("");
  if (node.ancestry.length > 0) {
    lines.push("Ancestry:");
    for (const ancestor of node.ancestry) {
      lines.push(`- \`${ancestor.type}\``);
    }
  }
  return lines.join("\n");
}

// ── Query ────────────────────────────────────────────────────────────

export async function executeQuery(
  service: TreeSitterService,
  file: string,
  queryString: string,
): Promise<string> {
  if (!queryString || queryString.trim().length === 0) {
    return "Validation error: query is required and must be non-empty.";
  }

  const result = await service.query(file, queryString);
  if (result.kind !== "success") return formatNonSuccess(result);

  const captures = result.data;
  if (captures.length === 0) return "No captures matched this query.";

  const { included, omitted } = capItems(captures, MAX_ITEMS);
  const lines = [`## Query results: ${file}`, ""];
  for (const cap of included) {
    lines.push(
      `- @${cap.name} \`${cap.nodeType}\` L${cap.range.startLine}:${cap.range.startCharacter} "${truncateStr(cap.text, 80)}"`,
    );
  }
  if (omitted) lines.push("", `... and ${omitted} more captures`);
  return lines.join("\n");
}

// ── Callees ──────────────────────────────────────────────────────────

export async function executeCallees(
  service: TreeSitterService,
  file: string,
  line: number,
  character: number,
): Promise<string> {
  const result = await service.calleesAt(file, line, character);
  if (result.kind !== "success") return formatNonSuccess(result);

  const calleesResult = result.data;
  const lines = [`## Callees in ${calleesResult.enclosingScope.name} (${file})`, ""];
  if (calleesResult.callees.length === 0) {
    lines.push("No outgoing calls found.");
  } else {
    for (const callee of calleesResult.callees) {
      lines.push(`- **${callee.name}** (L${callee.range.startLine})`);
    }
  }
  return lines.join("\n");
}

// ── Helpers ──────────────────────────────────────────────────────────

function capItems<T>(items: T[], max: number): { included: T[]; omitted: number } {
  if (items.length <= max) return { included: items, omitted: 0 };
  return { included: items.slice(0, max), omitted: items.length - max };
}

function truncateStr(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}
