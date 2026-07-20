/** Markdown adapter for assembled code_graph evidence. */

import { renderReadNextSection } from "../../analysis/read-next.ts";
import type { GraphResultAssembly } from "../result/graph.ts";
import { renderCallsResult } from "./calls-md.ts";
import { renderImplementationsResult } from "./implementations-md.ts";
import { renderReferencesResult } from "./references-md.ts";

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
