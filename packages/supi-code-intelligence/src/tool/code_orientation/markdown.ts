import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
import { renderReadNextSection } from "../../analysis/read-next.ts";
import type {
  OrientationItem,
  OrientationProvenance,
  OrientationSectionData,
} from "../../session/orientation-types.ts";
import { assembledReadNext } from "../result/assembly.ts";
import type { OrientationResultAssembly } from "./result.ts";

/**
 * Sole model-facing markdown adapter for Orientation.
 *
 * Collectors emit presentation-neutral facts (title, notes, and per-section
 * {@link OrientationItem}s); this adapter owns all document framing — the
 * leading notes, the h1 title, the optional Focus section, and each section's
 * h2 heading + status note.
 */
export function renderOrientationResult(assembly: OrientationResultAssembly): string {
  const data = assembly.assembled.data;
  const lines: string[] = [];

  for (const note of data.notes) lines.push(note);
  if (data.notes.length > 0) lines.push("");

  lines.push(`# ${data.title}`, "");

  if (data.target && data.focusTarget) {
    lines.push("## Focus", `- \`${data.focusTarget}\``, "");
  }

  for (const section of data.sections) {
    lines.push(`## ${section.title}`, formatSectionNote(section));
    renderItems(lines, section.items);
    lines.push("");
  }

  lines.push(...renderReadNextSection(assembledReadNext(assembly.assembled)));
  return lines.join("\n").trimEnd();
}

function renderItems(lines: string[], items: readonly OrientationItem[]): void {
  for (const item of items) {
    switch (item.kind) {
      case "paragraph":
        lines.push(item.text);
        break;
      case "list-item":
        lines.push(`- ${item.text}`);
        break;
      case "subheading":
        lines.push(`### ${item.text}`);
        break;
      case "code":
        lines.push(`\`\`\`${item.language ?? ""}`, ...item.lines, "```");
        break;
      case "blank":
        lines.push("");
        break;
    }
  }
}

/** Render the same section status/provenance metadata stored in result details. */
function formatSectionNote(section: OrientationSectionData): string {
  const facts = section.evidenceLists.map(evidenceSummary).join("; ");
  const provenance = section.provenance.map(formatProvenance).join(", ");
  return `_(status: ${section.status}; provenance: ${provenance || "none"}${section.reason ? `; ${section.reason}` : ""}${facts ? `; ${facts}` : ""})_`;
}

function evidenceSummary(metadata: EvidenceListMetadata): string {
  if (metadata.totalCount === null) {
    const omitted = metadata.omittedCount ? `; ${metadata.omittedCount} collected omitted` : "";
    return `showing ${metadata.shownCount}${omitted}; more may exist — ${metadata.partialReason ?? "partial"}`;
  }
  if ((metadata.omittedCount ?? 0) > 0) {
    return `showing ${metadata.shownCount} of ${metadata.totalCount}; ${metadata.omittedCount} omitted`;
  }
  return `${metadata.totalCount} observed`;
}

function formatProvenance(provenance: OrientationProvenance): string {
  const detail = provenance.detail ? ` \`${provenance.detail}\`` : "";
  return `${provenance.source}${provenance.capability ? ` (${provenance.capability})` : ""}${detail}`;
}
