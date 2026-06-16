/**
 * Implementations markdown renderer — renders semantic implementation locations.
 */

import type { ImplementationEntry } from "../../analysis/implementations/service.ts";
import { toDisplayPath } from "../../search-helpers.ts";
import { compactLineRanges } from "../../use-case/support/semantic-references.ts";

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
): string {
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

    const byFile = groupByFile(impls, cwd);
    let shown = 0;
    for (const [file, locations] of byFile) {
      if (shown >= maxResults) break;
      lines.push(`### ${file}`);
      lines.push(`- ${compactLineRanges(locations)}`);
      lines.push("");
      shown++;
    }

    if (byFile.size > maxResults) {
      lines.push(
        `_+${byFile.size - maxResults} more files omitted. Narrow with \`path\` or increase \`maxResults\`._`,
      );
    }
  }

  if (externalCount > 0) {
    lines.push(
      `_+${externalCount} external location${externalCount !== 1 ? "s" : ""} (outside this project)_`,
    );
    lines.push("");
  }

  return lines.join("\n");
}
