/**
 * Implementations markdown renderer — renders semantic implementation locations.
 */

import type { ImplementationEntry } from "../../analysis/implementations/service.ts";

// biome-ignore lint/complexity/useMaxParams: render function with independent display parameters
export function renderImplementationsResult(
  impls: ImplementationEntry[],
  externalCount: number,
  _cwd: string,
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
    const shown = impls.slice(0, maxResults);
    for (const impl of shown) {
      lines.push(`- \`${impl.file}:${impl.line}\``);
    }
    lines.push("");
  }

  if (externalCount > 0) {
    lines.push(
      `_+${externalCount} external location${externalCount !== 1 ? "s" : ""} (outside this project)_`,
    );
    lines.push("");
  }

  lines.push(
    "_Semantic analysis. Use `code_pattern` only when you explicitly want text-search hints._",
  );
  lines.push("");
  return lines.join("\n");
}
