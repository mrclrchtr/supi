/** References markdown renderer over assembled semantic evidence. */

import type { EvidenceList, EvidenceListMetadata } from "../../analysis/evidence.ts";
import { formatAssembledReferenceList } from "../../analysis/references/semantic-refs.ts";
import type { ReferenceEntry } from "../../analysis/relations/types.ts";
import { toDisplayPath } from "../../analysis/search/ripgrep.ts";
import { renderInvalidProviderLocations } from "./provider-location-md.ts";

export function renderReferencesResult(options: {
  symbolName: string;
  references: EvidenceList<ReferenceEntry>;
  externalCount: number;
  confidence: string;
  cwd: string;
}): { content: string; evidenceList: EvidenceListMetadata | null } {
  const total = options.references.metadata.totalCount ?? options.references.metadata.shownCount;
  const lines = [
    `# References of \`${options.symbolName}\``,
    "",
    `**${total} reference${total === 1 ? "" : "s"}** (${options.confidence})`,
  ];
  if (options.externalCount > 0) {
    lines.push(
      `_+${options.externalCount} external reference${options.externalCount === 1 ? "" : "s"}_`,
    );
  }
  const invalidDisclosure = renderInvalidProviderLocations(options.references.metadata);
  if (invalidDisclosure) lines.push(invalidDisclosure);
  lines.push("");

  const displayEvidence = {
    key: options.references.key,
    items: options.references.items.map((reference) => ({
      file: toDisplayPath(options.cwd, reference.file),
      line: reference.line,
    })),
    metadata: options.references.metadata,
  };
  const evidenceList = formatAssembledReferenceList(lines, displayEvidence);
  return { content: lines.join("\n"), evidenceList };
}
