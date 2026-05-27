/**
 * Tree-sitter expert tool formatting — markdown rendering for structural analysis results.
 *
 * Handles outline, imports, exports, node-at, query, and callee rendering.
 * All string formatting for tree_sitter_* tools lives here.
 */

import type { OutlineItem } from "@mrclrchtr/supi-tree-sitter/api";

export const MAX_ITEMS = 100;

export function formatNonSuccess(result: { kind: string; message?: string }): string {
  switch (result.kind) {
    case "unsupported-language":
      return `**Unsupported language:** ${result.message}`;
    case "file-access-error":
      return `**File access error:** ${result.message}`;
    case "validation-error":
      return `**Validation error:** ${result.message}`;
    case "runtime-error":
      return `**Runtime error:** ${result.message}`;
    default:
      return `**Error:** ${result.message ?? result.kind}`;
  }
}

export function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.substring(0, maxLen)}…`;
}

export function truncate<T>(items: T[], max: number): { included: T[]; truncated: number } {
  if (items.length <= max) return { included: items, truncated: 0 };
  return { included: items.slice(0, max), truncated: items.length - max };
}

export function truncatedNotice(count: number, kind: string, max = MAX_ITEMS): string {
  return `⚠ ${count} additional ${kind} omitted (result capped at ${max}).`;
}

interface OutlineFormatContext {
  lines: string[];
  max: number;
  emitted: number;
  omitted: number;
}

export function formatOutlineItemsCapped(
  items: OutlineItem[],
  lines: string[],
  max = MAX_ITEMS,
): { emitted: number; omitted: number } {
  const context: OutlineFormatContext = { lines, max, emitted: 0, omitted: 0 };
  appendOutlineItems(items, context, 0);
  return { emitted: context.emitted, omitted: context.omitted };
}

function appendOutlineItems(
  items: OutlineItem[],
  context: OutlineFormatContext,
  depth: number,
): void {
  for (const item of items) {
    if (context.emitted >= context.max) {
      context.omitted += countOutlineItems(item);
      continue;
    }
    appendOutlineItem(item, context, depth);
    context.emitted++;
    if (item.children?.length) {
      appendOutlineItems(item.children, context, depth + 1);
    }
  }
}

function appendOutlineItem(item: OutlineItem, context: OutlineFormatContext, depth: number): void {
  const indent = "  ".repeat(depth);
  const range = item.range;
  context.lines.push(
    `${indent}- ${item.kind}: ${item.name} (L${range.startLine}:${range.startCharacter}-L${range.endLine}:${range.endCharacter})`,
  );
}

function countOutlineItems(item: OutlineItem): number {
  const childCount = item.children?.reduce((sum, child) => sum + countOutlineItems(child), 0) ?? 0;
  return 1 + childCount;
}
