/** Implementations markdown renderer over assembled semantic evidence. */

import {
  type EvidenceList,
  type EvidenceListMetadata,
  renderEvidenceListMetadataDisclosure,
} from "../../analysis/evidence.ts";
import { compactLineRanges } from "../../analysis/references/semantic-refs.ts";
import type { ImplementationEntry } from "../../analysis/relations/types.ts";
import { toDisplayPath } from "../../analysis/search/ripgrep.ts";
import { renderInvalidProviderLocations } from "./provider-location-md.ts";

function groupByFile(impls: readonly ImplementationEntry[], cwd: string): Map<string, number[]> {
  const byFile = new Map<string, number[]>();
  for (const impl of impls) {
    const displayPath = toDisplayPath(cwd, impl.file);
    const group = byFile.get(displayPath) ?? [];
    group.push(impl.line);
    byFile.set(displayPath, group);
  }
  return byFile;
}

export function renderImplementationsResult(options: {
  implementations: EvidenceList<ImplementationEntry>;
  externalCount: number;
  cwd: string;
  targetName?: string;
}): { content: string; evidenceList: EvidenceListMetadata } {
  const lines: string[] = [
    options.targetName
      ? `# Implementations of \`${options.targetName}\` (semantic)`
      : "# Implementations (semantic)",
    "",
  ];
  const total =
    options.implementations.metadata.totalCount ?? options.implementations.metadata.shownCount;
  if (total > 0) {
    lines.push(`**${total} implementation${total === 1 ? "" : "s"}** in the project`, "");
    for (const [file, locations] of groupByFile(options.implementations.items, options.cwd)) {
      lines.push(`### ${file}`, `- ${compactLineRanges(locations)}`, "");
    }
    const disclosure = renderEvidenceListMetadataDisclosure(options.implementations.metadata);
    if (disclosure) lines.push(disclosure);
  }

  if (options.externalCount > 0) {
    lines.push(
      `_+${options.externalCount} external location${options.externalCount === 1 ? "" : "s"} (outside this project)_`,
      "",
    );
  }
  const invalidDisclosure = renderInvalidProviderLocations(options.implementations.metadata);
  if (invalidDisclosure) lines.push(invalidDisclosure, "");

  return { content: lines.join("\n"), evidenceList: options.implementations.metadata };
}
