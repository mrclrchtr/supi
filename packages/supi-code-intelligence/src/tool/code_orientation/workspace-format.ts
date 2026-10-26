import * as path from "node:path";
import type { WorkspaceOrientationFacts } from "../../session/orientation/workspace-context.ts";
import type { OrientationSectionData } from "../../session/orientation-types.ts";

/** Escape repository text without interpreting names as project roles. */
export function plain(value: string): string {
  return value
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;")
    .replaceAll("`", "&#96;");
}
/** Preserve literal names and paths; use explicit JSON strings for unsafe table characters. */
export function code(value: string): string {
  if (/[|`\p{Cc}\p{Cf}]/u.test(value) || /^\s|\s$/u.test(value)) {
    const encoded = JSON.stringify(value).replace(/[|`\p{Cc}\p{Cf}]/gu, (character) =>
      character
        .split("")
        .map((unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`)
        .join(""),
    );
    return `\`${encoded}\` (JSON string)`;
  }
  return `\`${value}\``;
}

/** Return paths that remain usable from the session working directory for explicit outside focuses. */
export function sourcePath(facts: WorkspaceOrientationFacts, relative: string): string {
  return (
    path
      .relative(facts.cwd, path.resolve(facts.observation.root, relative))
      .replaceAll(path.sep, "/") || "."
  );
}

/** One list cap applies to evidence rows, not to table framing. */
export function tableSection(
  key: string,
  title: string,
  options: {
    headers: string[];
    rows: string[][];
    limit: number;
    detail: string;
    source?: "filesystem" | "manifest" | "runtime";
  },
): OrientationSectionData {
  const { headers, rows, limit, detail, source = "filesystem" } = options;
  const shown = rows.slice(0, limit);
  return {
    key,
    title,
    status: "complete",
    reason: null,
    confidence: "unavailable",
    provenance: [{ source, detail }],
    evidenceLists: [
      {
        key,
        totalCount: rows.length,
        shownCount: shown.length,
        omittedCount: rows.length - shown.length,
        partialReason: null,
      },
    ],
    tableEvidenceKey: key,
    items:
      rows.length === 0
        ? [{ kind: "paragraph", text: "No collected entries." }]
        : [{ kind: "table", headers, rows: shown }],
  };
}
