import { readFileSync } from "node:fs";

/** Longest stored source line; bounds minified or generated lines in structured output. */
const MAX_SOURCE_LINE_LENGTH = 400;

/**
 * Attach the trimmed, length-bounded source line to each relation site, read from disk once per file.
 * Sites stay without `text` when the file is unreadable, the line does not exist, or it is blank.
 * Call this on bounded evidence only, so the cost follows the Result cap, not the collected total.
 */
export function attachSourceLines<T extends { file: string; line: number }>(
  sites: readonly T[],
): (T & { text?: string })[] {
  const cache = new Map<string, readonly string[] | null>();
  return sites.map((site) => {
    if (!cache.has(site.file)) cache.set(site.file, readLines(site.file));
    const line = cache.get(site.file)?.[site.line - 1]?.trim();
    if (!line) return site;
    const text =
      line.length > MAX_SOURCE_LINE_LENGTH ? `${line.slice(0, MAX_SOURCE_LINE_LENGTH - 1)}…` : line;
    return { ...site, text };
  });
}

function readLines(file: string): readonly string[] | null {
  try {
    return readFileSync(file, "utf8").split(/\r\n|\r|\n/u);
  } catch {
    return null;
  }
}
