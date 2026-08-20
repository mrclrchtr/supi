// Aggregate output bound for the joined Agent Run parent result.
//
// The complete joined result is assembled and measured first. When it fits
// PI's standard model-output limit it is returned unchanged. When it exceeds
// either limit, visible space is allocated fairly: every task header/status
// line always remains, the remaining byte budget is split across tasks and
// unused shares are redistributed to longer outputs, and every shortened
// section ends with an exact truncation marker stating its original character
// count. The complete joined Markdown is spilled to a private OS temporary
// directory and the path is returned in the result.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGGREGATE_MAX_BYTES, AGGREGATE_MAX_LINES } from "./bounds.ts";

/** One ordered task section of the joined parent result. */
export interface AggregateSection {
  /** Always-visible section head: header and status lines. */
  overhead: string;
  /** Body text that can be shortened when the aggregate limit applies. */
  body: string;
}

/** Result of bounding the joined parent result. */
export interface BoundedAggregateOutput {
  /** Model-facing joined text, with an exact spill notice when truncated. */
  text: string;
  /** Whether the complete joined Markdown was spilled to a temporary file. */
  truncated: boolean;
  /** Path to the complete spilled Markdown, present only when truncated. */
  fullOutputPath?: string;
}

export interface BoundAggregateOptions {
  maxBytes?: number;
  maxLines?: number;
}

/** One line, so a truncated body can keep its marker inside the line budget. */
function truncationMarker(originalChars: number): string {
  return `\n[truncated: ${originalChars.toLocaleString("en-US")} total characters]`;
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf-8");
}

function lineCount(text: string): number {
  return text.length === 0 ? 0 : text.split("\n").length;
}

/** Longest code-point-safe prefix of `text` that fits within `budgetBytes`. */
function bytePrefix(text: string, budgetBytes: number): string {
  let used = 0;
  let end = 0;
  for (const ch of text) {
    const size = byteLength(ch);
    if (used + size > budgetBytes) break;
    used += size;
    end += ch.length;
  }
  return text.slice(0, end);
}

/**
 * Split `budgetBytes` fairly across bodies, redistributing unused shares to
 * longer outputs. Each body that needs less than its base share releases the
 * difference into a pool; bodies that need more receive from the pool in
 * descending need order.
 */
export function fairByteShares(bodyBytes: readonly number[], budgetBytes: number): number[] {
  const n = bodyBytes.length;
  const shares = new Array<number>(n).fill(0);
  if (n === 0 || budgetBytes <= 0) return shares;

  const base = Math.floor(budgetBytes / n);
  let pool = 0;
  const needers: Array<{ index: number; need: number }> = [];
  for (let i = 0; i < n; i++) {
    const need = bodyBytes[i];
    if (need <= base) {
      shares[i] = need;
      pool += base - need;
    } else {
      shares[i] = base;
      needers.push({ index: i, need });
    }
  }
  needers.sort((a, b) => b.need - a.need);
  for (const { index, need } of needers) {
    if (pool <= 0) break;
    const add = Math.min(need - shares[index], pool);
    shares[index] += add;
    pool -= add;
  }
  return shares;
}

interface KeptBody {
  prefix: string;
  marker?: string;
}

/**
 * Bound the joined Agent Run parent result to PI's standard model-output
 * limit (2,000 lines or 51,200 UTF-8 bytes, whichever is reached first).
 *
 * Every task section head always remains. When the joined result exceeds the
 * limit, the byte budget left after all fixed overhead is split fairly with
 * redistribution of unused shares; shortened bodies end with an exact
 * truncation marker. If the result still exceeds the line limit, trailing
 * lines are dropped from the longest kept body until it fits. The complete
 * joined Markdown is spilled to a private OS temporary directory and the
 * path is appended to the returned text.
 */
export function boundAggregateOutput(
  sections: readonly AggregateSection[],
  options: BoundAggregateOptions = {},
): BoundedAggregateOutput {
  const maxBytes = options.maxBytes ?? AGGREGATE_MAX_BYTES;
  const maxLines = options.maxLines ?? AGGREGATE_MAX_LINES;

  const joinAll = (bodies: readonly KeptBody[]): string =>
    sections
      .map((section, i) => {
        const body = bodies[i];
        if (!section.body) return section.overhead;
        const bodyText = body.marker ? `${body.prefix}${body.marker}` : body.prefix;
        return `${section.overhead}\n${bodyText}`;
      })
      .join("\n\n");

  const fullBodies = sections.map((section) => section.body);
  const full = joinAll(fullBodies.map((body) => ({ prefix: body })));
  if (lineCount(full) <= maxLines && byteLength(full) <= maxBytes) {
    return { text: full, truncated: false };
  }

  const dir = mkdtempSync(join(tmpdir(), "supi-agent-"));
  const fullOutputPath = join(dir, "batch-output.md");
  writeFileSync(fullOutputPath, full, "utf-8");
  const notice = `\n_Full output saved to: \`${fullOutputPath}\`_`;

  // Fixed per-section cost: overhead, the newline before its body, and the
  // blank separator line between sections.
  const fixedTotal = sections.reduce((sum, section, i) => {
    let cost = byteLength(section.overhead);
    cost += section.body ? 1 : 0;
    cost += i > 0 ? 2 : 0;
    return sum + cost;
  }, 0);
  const bodyBudget = Math.max(0, maxBytes - fixedTotal - byteLength(notice));
  const bodyBytes = fullBodies.map(byteLength);
  const shares = fairByteShares(bodyBytes, bodyBudget);

  const kept: KeptBody[] = fullBodies.map((body, i) => {
    const share = shares[i];
    if (share >= bodyBytes[i]) return { prefix: body };
    const marker = truncationMarker(body.length);
    const markerBytes = byteLength(marker);
    if (share <= markerBytes) return { prefix: "", marker };
    return { prefix: bytePrefix(body, share - markerBytes), marker };
  });

  // Line budget: drop one trailing line from the longest kept body until the
  // joined result (including the spill notice) fits. Bytes only shrink.
  let joined = joinAll(kept);
  while (lineCount(`${joined}${notice}`) > maxLines) {
    let largest = -1;
    let largestLines = 0;
    for (let i = 0; i < kept.length; i++) {
      const lines = lineCount(kept[i].prefix);
      if (lines > largestLines) {
        largestLines = lines;
        largest = i;
      }
    }
    if (largest === -1) break;
    const lines = kept[largest].prefix.split("\n");
    lines.pop();
    kept[largest].prefix = lines.join("\n");
    joined = joinAll(kept);
  }

  return { text: `${joined}${notice}`, truncated: true, fullOutputPath };
}
