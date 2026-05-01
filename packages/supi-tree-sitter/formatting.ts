// Formatting helpers for tree_sitter tool output.

import type { OutlineItem, TreeSitterResult } from "./types.ts";

export const MAX_ITEMS = 100;

export function validationError(message: string): string {
  return `**Validation error:** ${message}`;
}

export function formatNonSuccess(
  result: Exclude<TreeSitterResult<unknown>, { kind: "success" }>,
): string {
  switch (result.kind) {
    case "unsupported-language":
      return `**Unsupported language:** ${result.message}`;
    case "file-access-error":
      return `**File access error:** ${result.message}`;
    case "validation-error":
      return `**Validation error:** ${result.message}`;
    case "runtime-error":
      return `**Runtime error:** ${result.message}`;
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

/**
 * Append outline items to `lines` while enforcing a recursive item cap.
 *
 * The cap counts every printed declaration, including nested methods and other
 * children. This keeps generated or deeply nested files from bypassing the
 * `tree_sitter` tool's agent-facing result limit.
 */
export function formatOutlineItemsCapped(
  items: OutlineItem[],
  lines: string[],
  max = MAX_ITEMS,
): { emitted: number; omitted: number } {
  const context: OutlineFormatContext = { lines, max, emitted: 0, omitted: 0 };
  appendOutlineItems(items, context, 0);
  return { emitted: context.emitted, omitted: context.omitted };
}

/** Append outline items without a cap. Prefer `formatOutlineItemsCapped` for tool output. */
export function formatOutlineItems(items: OutlineItem[], lines: string[], depth: number): void {
  appendOutlineItems(
    items,
    { lines, max: Number.POSITIVE_INFINITY, emitted: 0, omitted: 0 },
    depth,
  );
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
