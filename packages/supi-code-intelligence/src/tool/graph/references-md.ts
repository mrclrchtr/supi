/**
 * References markdown renderer — labels results as references/usages, not callers.
 */

import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
import { formatReferenceList } from "../../analysis/references/semantic-refs.ts";
import { toDisplayPath } from "../../analysis/search/ripgrep.ts";
import type { ReferenceEntry } from "./types.ts";

// biome-ignore lint/complexity/useMaxParams: render function with independent display parameters
export function renderReferencesResult(
  symbolName: string,
  refs: ReferenceEntry[],
  externalCount: number,
  confidence: string,
  cwd: string,
  maxResults: number,
): { content: string; evidenceList: EvidenceListMetadata | null } {
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
  const evidenceList = formatReferenceList(lines, refLines, maxResults);
  return { content: lines.join("\n"), evidenceList };
}
