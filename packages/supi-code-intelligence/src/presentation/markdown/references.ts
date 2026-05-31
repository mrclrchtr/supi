/**
 * References markdown renderer — labels results as references/usages, not callers.
 */

import type { ReferenceEntry } from "../../analysis/references/service.ts";
import { toDisplayPath } from "../../search-helpers.ts";
import { formatReferenceList } from "../../use-case/support/semantic-references.ts";

// biome-ignore lint/complexity/useMaxParams: render function with independent display parameters
export function renderReferencesResult(
  symbolName: string,
  refs: ReferenceEntry[],
  externalCount: number,
  confidence: string,
  cwd: string,
  maxResults: number,
): string {
  const lines: string[] = [];
  lines.push(`# References of \`${symbolName}\``);
  lines.push("");
  lines.push(`**${refs.length} reference${refs.length !== 1 ? "s" : ""}** (${confidence})`);
  if (externalCount > 0) {
    lines.push(`_+${externalCount} external reference${externalCount !== 1 ? "s" : ""}_`);
  }
  lines.push("");

  const refLines: Array<{ file: string; line: number }> = refs.map((r) => ({
    file: toDisplayPath(cwd, r.file),
    line: r.line,
  }));
  formatReferenceList(lines, refLines, maxResults, cwd);
  return lines.join("\n");
}
