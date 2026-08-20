/** Markdown adapter for assembled code_graph evidence. */

import {
  type EvidenceList,
  type EvidenceListMetadata,
  renderEvidenceListMetadataDisclosure,
} from "../../analysis/evidence.ts";
import { renderReadNextSection } from "../../analysis/read-next.ts";
import {
  compactLineRanges,
  formatAssembledReferenceList,
} from "../../analysis/references/semantic-refs.ts";
import type {
  CallEntry,
  CalleeScope,
  ImplementationEntry,
  ReferenceEntry,
} from "../../analysis/relations/types.ts";
import { toDisplayPath } from "../../analysis/search/paths.ts";
import type { GraphResultAssembly } from "./result.ts";

/** Render an assembled graph result. */
export function renderGraphResult(assembly: GraphResultAssembly): string {
  const lines = [
    `# Graph of \`${assembly.displayName}\``,
    "",
    `_File: \`${assembly.resolvedDisplayFile}\`_`,
    "",
  ];

  const available = assembly.sections.filter((section) => section.kind === "ok");
  if (available.length > 0) {
    lines.push(
      available
        .map(
          (section) =>
            `**${section.rel}**: ${sectionCount(section)} result${sectionCount(section) === 1 ? "" : "s"}`,
        )
        .join(" | "),
      "",
    );
  }

  const unavailable = assembly.sections.filter((section) => section.kind === "unavailable");
  if (unavailable.length > 0) {
    lines.push(
      `_Unavailable: ${unavailable.map((section) => `\`${section.rel}\``).join(", ")}_`,
      "",
    );
  }

  for (const section of assembly.sections) {
    if (section.kind === "unavailable") {
      lines.push(`**${section.rel}**: ${section.message}`, "");
      continue;
    }

    switch (section.rel) {
      case "references": {
        const rendered = renderReferencesResult({
          symbolName: assembly.displayName,
          references: section.evidence,
          externalCount: section.data.externalCount,
          confidence: section.data.confidence,
          cwd: assembly.cwd,
        });
        lines.push(rendered.content, "");
        break;
      }
      case "callees": {
        const rendered = renderCallsResult(
          section.data.enclosingScope,
          section.evidence,
          assembly.resolvedDisplayFile,
          section.data.depth,
        );
        lines.push(rendered.content, "");
        break;
      }
      case "implements": {
        const rendered = renderImplementationsResult({
          implementations: section.evidence,
          externalCount: section.data.externalCount,
          cwd: assembly.cwd,
          targetName: assembly.displayName,
        });
        lines.push(rendered.content, "");
        break;
      }
    }
  }

  lines.push(...renderReadNextSection(available.flatMap((section) => section.readNext)));
  return lines.join("\n");
}

function sectionCount(
  section: Extract<GraphResultAssembly["sections"][number], { kind: "ok" }>,
): number {
  return section.evidence.metadata.totalCount ?? section.evidence.metadata.shownCount;
}

function renderReferencesResult(options: {
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

function renderCallsResult(
  enclosingScope: CalleeScope,
  calls: EvidenceList<CallEntry>,
  relPath: string,
  depth: "direct" | "deep" = "direct",
): { content: string; evidenceList: EvidenceListMetadata } {
  const lines: string[] = [];
  const depthLabel = depth === "deep" ? "Deep structural calls" : "Direct structural calls";
  const depthNote =
    depth === "deep"
      ? "_Deep: includes calls from nested function/method/callback scopes within the enclosing scope._"
      : "_Structural only: call expressions are reported by source shape, not symbol identity; calls inside nested function/method/callback scopes are excluded from this enclosing scope._";
  const total = calls.metadata.totalCount ?? calls.metadata.shownCount;

  lines.push(`# ${depthLabel} from \`${enclosingScope.name}\``, "");
  lines.push(
    `**${total} ${depth === "deep" ? "" : "direct "}structural call${total === 1 ? "" : "s"}** from enclosing scope \`${enclosingScope.name}\` (${formatScopeRange(enclosingScope)}) in \`${relPath}\``,
    "",
    depthNote,
    "",
  );

  for (const call of calls.items) lines.push(`- \`${call.name}\` (L${call.line})`);
  const disclosure = renderEvidenceListMetadataDisclosure(calls.metadata);
  if (disclosure) lines.push(disclosure);
  return { content: lines.join("\n"), evidenceList: calls.metadata };
}

function renderImplementationsResult(options: {
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

function formatScopeRange(scope: CalleeScope): string {
  if (scope.startLine === scope.endLine) return `L${scope.startLine}`;
  return `L${scope.startLine}–L${scope.endLine}`;
}

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

/** Render an explicit disclosure for unusable semantic-provider locations. */
function renderInvalidProviderLocations(metadata: EvidenceListMetadata): string | null {
  const count = metadata.invalidLocationCount ?? 0;
  if (count <= 0 || metadata.partialReason === null) return null;
  const noun = count === 1 ? "location" : "locations";
  return `_${count} invalid provider ${noun} omitted (${metadata.partialReason})_`;
}
