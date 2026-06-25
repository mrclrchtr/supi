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
