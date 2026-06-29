// Hidden overview markdown renderer for the first-turn session injection.
// Consumes OverviewData produced by the overview use-case.

import type { OverviewData } from "./types.ts";

/**
 * Render the compact architecture overview for first-turn session injection.
 * Targets roughly 500 tokens.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: module-edge overview rendering with multiple formatting paths is clearer as one function
export function renderOverview(data: OverviewData): string {
  const lines: string[] = [];

  lines.push("# Project: Code Intelligence Overview");
  lines.push("");

  if (data.projectName) {
    lines.push(
      `**${data.projectName}**${data.projectDescription ? ` — ${data.projectDescription}` : ""}`,
    );
    lines.push("");
  }

  lines.push("## Modules");
  lines.push("");

  for (const mod of data.modules) {
    const deps = mod.internalDeps.filter((d) =>
      data.modules.some((m) => m.name === d || m.shortName === d),
    );

    if (deps.length === 0) {
      lines.push(
        `- **${mod.shortName}**${mod.isLeaf ? " (leaf)" : ""}${mod.description ? ` — ${mod.description}` : ""}`,
      );
    } else {
      const depNames = deps.slice(0, 4).map((d) => d.replace(/^@[^/]+\//, ""));
      const depStr = depNames.join(", ");
      const suffix = deps.length > 4 ? ` +${deps.length - 4} more` : "";
      lines.push(
        `- **${mod.shortName}** → ${depStr}${suffix}${mod.description ? ` — ${mod.description}` : ""}`,
      );
    }
  }

  if (data.omittedModuleCount > 0) {
    lines.push(`- _+${data.omittedModuleCount} more modules omitted_`);
  }

  lines.push("");

  if (data.gitContextOverview) {
    lines.push(data.gitContextOverview);
  }

  lines.push('_For deeper orientation, use `code_orientation({ focus: "..." })`._');

  return lines.join("\n");
}
