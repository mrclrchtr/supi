// Map markdown renderer — consumes MapData and produces markdown content + details metadata.

import type { MapDetails } from "../../types.ts";
import type { MapData, MapStats } from "../../use-case/generate-map.ts";
import { SOURCE_EXTENSIONS } from "../../use-case/generate-map.ts";

export function renderMap(data: MapData): { content: string; details: MapDetails } {
  const content = formatMap(data.scope, data.stats);
  const details: MapDetails = {
    scope: data.scope,
    totalFiles: data.stats.total,
    childDirectoryCount: data.stats.byChildDir.size,
    landmarkCount: data.stats.landmarkFiles.length,
    nextQueries: ["`code_brief` for prioritized context on this scope"],
  };

  return { content, details };
}

function formatMap(scope: string, stats: MapStats): string {
  const lines: string[] = [];

  lines.push(`# Code Map: ${scope}`);
  lines.push("");
  lines.push(`**Files:** ${stats.total} total`);
  for (const [ext, count] of [...stats.byExtension.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)) {
    const label = SOURCE_EXTENSIONS.get(ext) ?? (ext || "(no extension)");
    lines.push(`- ${label}: ${count}`);
  }
  if (stats.byExtension.size > 10) {
    lines.push(`- _+${stats.byExtension.size - 10} more extensions_`);
  }
  lines.push("");

  if (stats.byChildDir.size > 0) {
    lines.push("**Child directories:**");
    for (const [dir, count] of [...stats.byChildDir.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${dir}/ (${count} file${count !== 1 ? "s" : ""})`);
    }
    lines.push("");
  }

  if (stats.landmarkFiles.length > 0) {
    lines.push("**Landmark files:**");
    for (const file of stats.landmarkFiles) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}
