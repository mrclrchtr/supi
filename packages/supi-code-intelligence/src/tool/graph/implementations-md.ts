/**
 * Implementations markdown renderer — renders semantic implementation locations.
 */

import {
  createEvidenceList,
  type EvidenceListMetadata,
  renderEvidenceListDisclosure,
} from "../../analysis/evidence.ts";
import { compactLineRanges } from "../../analysis/references/semantic-refs.ts";
import { toDisplayPath } from "../../analysis/search/ripgrep.ts";
import type { ImplementationEntry } from "./types.ts";

/**
 * Group implementation entries by display file path, collecting line numbers.
 */
function groupByFile(impls: ImplementationEntry[], cwd: string): Map<string, number[]> {
  const byFile = new Map<string, number[]>();
  for (const impl of impls) {
    const displayPath = toDisplayPath(cwd, impl.file);
    const group = byFile.get(displayPath) ?? [];
    group.push(impl.line);
    byFile.set(displayPath, group);
  }
  return byFile;
}

// biome-ignore lint/complexity/useMaxParams: render function with independent display parameters
export function renderImplementationsResult(
  impls: ImplementationEntry[],
  externalCount: number,
  cwd: string,
  maxResults: number,
  targetName?: string,
): { content: string; evidenceList: EvidenceListMetadata | null } {
  const lines: string[] = [];
  lines.push(
    targetName
      ? `# Implementations of \`${targetName}\` (semantic)`
      : "# Implementations (semantic)",
  );
  lines.push("");
  if (impls.length > 0) {
    lines.push(`**${impls.length} implementation${impls.length !== 1 ? "s" : ""}** in the project`);
    lines.push("");

    const evidence = createEvidenceList({
      key: "implements.locations",
      items: impls,
      maxResults,
    });
    const byFile = groupByFile(evidence.items, cwd);
    for (const [file, locations] of byFile) {
      lines.push(`### ${file}`);
      lines.push(`- ${compactLineRanges(locations)}`);
      lines.push("");
    }

    const disclosure = renderEvidenceListDisclosure(evidence);
    if (disclosure) {
      lines.push(disclosure);
    }
  }

  if (externalCount > 0) {
    lines.push(
      `_+${externalCount} external location${externalCount !== 1 ? "s" : ""} (outside this project)_`,
    );
    lines.push("");
  }

  return {
    content: lines.join("\n"),
    evidenceList:
      impls.length > 0
        ? createEvidenceList({ key: "implements.locations", items: impls, maxResults }).metadata
        : null,
  };
}
