export interface ReadNextItem {
  file: string;
  startLine: number;
  endLine: number;
  reason: string;
}

const DEFAULT_MAX_READ_LINES = 120;
const DEFAULT_CONTEXT_BEFORE = 5;
const DEFAULT_CONTEXT_AFTER = 40;

interface ReadNextRangeInput extends ReadNextItem {
  maxLines?: number;
}

/** Build read-next guidance for a known source range, bounded for readable tool output. */
export function readNextRange(input: ReadNextRangeInput): ReadNextItem {
  const maxLines = input.maxLines ?? DEFAULT_MAX_READ_LINES;
  const start = Math.max(1, Math.floor(input.startLine));
  const rawEnd = Math.max(start, Math.floor(input.endLine));
  const end = Math.min(rawEnd, start + Math.max(1, maxLines) - 1);
  return { file: input.file, startLine: start, endLine: end, reason: input.reason };
}

/** Build read-next guidance around a known point when no precise symbol range is available. */
export function readNextAround(
  file: string,
  line: number,
  reason: string,
  options: { before?: number; after?: number; maxLines?: number } = {},
): ReadNextItem {
  const before = options.before ?? DEFAULT_CONTEXT_BEFORE;
  const after = options.after ?? DEFAULT_CONTEXT_AFTER;
  const start = Math.max(1, Math.floor(line) - before);
  const end = Math.max(start, Math.floor(line) + after);
  return readNextRange({
    file,
    startLine: start,
    endLine: end,
    reason,
    maxLines: options.maxLines,
  });
}

/** Render guidance-chrome source ranges that should be inspected with the built-in read tool. */
export function renderReadNextSection(items: ReadNextItem[], maxItems = 3): string[] {
  const visible = dedupeReadNextItems(items).slice(0, maxItems);
  if (visible.length === 0) return [];

  const lines = ["## Read Next"];
  for (const item of visible) {
    const lineCount = item.endLine - item.startLine + 1;
    lines.push(
      `- \`${item.file}\` ${formatLineRange(item)} — ${item.reason} (\`read\` offset ${item.startLine}, limit ${lineCount})`,
    );
  }
  lines.push("");
  return lines;
}

function formatLineRange(item: ReadNextItem): string {
  if (item.startLine === item.endLine) return `L${item.startLine}`;
  return `L${item.startLine}–L${item.endLine}`;
}

// ── Higher-level builders (used by relation collectors and tool executors) ─

/**
 * Build a single read-next item to inspect the resolved target itself.
 *
 * Used by code_graph relation handlers and code_orientation to guide
 * the agent toward reading the target's source range.
 */
export function readNextTarget(file: string, line: number, reason?: string): ReadNextItem {
  return readNextAround(file, line, reason ?? "inspect the target implementation");
}

/**
 * Build read-next items for the top N reference/call/implementation sites.
 *
 * Used by the references and callees relation handlers in collect-relation.ts
 * to guide the agent toward the most relevant reference sites.
 */
export function readNextTopSites(
  sites: ReadonlyArray<{ file: string; line: number }>,
  maxSites = 2,
  label = "reference",
): ReadNextItem[] {
  return sites
    .slice(0, maxSites)
    .map((site) => readNextAround(site.file, site.line, `inspect a ${label} site`));
}

/**
 * Build a read-next item for an enclosing scope (function/class/block).
 *
 * Used by the callees relation handler and code_orientation's
 * findEnclosingOutlineItem to guide the agent toward inspecting the
 * scope that contains the target.
 */
export function readNextEnclosingScope(
  file: string,
  scope: { name?: string; startLine?: number; endLine?: number },
  fallbackLine: number,
  fallbackName?: string,
): ReadNextItem {
  const name = scope.name ?? fallbackName ?? "scope";
  return readNextRange({
    file,
    startLine: scope.startLine ?? fallbackLine,
    endLine: scope.endLine ?? scope.startLine ?? fallbackLine,
    reason: `inspect enclosing scope \`${name}\``,
  });
}

function dedupeReadNextItems(items: ReadNextItem[]): ReadNextItem[] {
  const seen = new Set<string>();
  const result: ReadNextItem[] = [];
  for (const item of items) {
    const key = `${item.file}:${item.startLine}:${item.endLine}:${item.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
