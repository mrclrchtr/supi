// LSP tool result formatting helpers — interim port from supi-lsp's format.ts.
//
// Simplifies tool-actions.ts by keeping formatting logic separate.

export function formatHover(contents: unknown): string {
  if (!contents) return "No hover information available.";
  const parts: string[] = [];
  if (typeof contents === "string") {
    parts.push(contents);
  } else if (Array.isArray(contents)) {
    for (const item of contents) {
      if (typeof item === "string") parts.push(item);
      else if (item && typeof item === "object" && "value" in item) {
        parts.push(String((item as { value: string }).value));
      }
    }
  } else if (contents && typeof contents === "object" && "value" in contents) {
    parts.push(String((contents as { value: string }).value));
  }
  return parts.join("\n");
}

export function formatLocation(uri: string | undefined, line: number, character: number): string {
  const filePath = uri?.startsWith("file://") ? decodeURIComponent(uri.slice(7)) : (uri ?? "");
  return `  ${filePath}:${line + 1}:${character + 1}`;
}

export function symbolKindName(kind: number): string {
  const names: Record<number, string> = {
    1: "File",
    2: "Module",
    3: "Namespace",
    4: "Package",
    5: "Class",
    6: "Method",
    7: "Property",
    8: "Field",
    9: "Constructor",
    10: "Enum",
    11: "Interface",
    12: "Function",
    13: "Variable",
    14: "Constant",
    15: "String",
    16: "Number",
    17: "Boolean",
    18: "Array",
    19: "Object",
    20: "Key",
    21: "Null",
    22: "EnumMember",
    23: "Struct",
    24: "Event",
    25: "Operator",
    26: "TypeParameter",
  };
  return names[kind] ?? `kind:${kind}`;
}

export function diagnosticSeverityLabel(severity: number): string {
  switch (severity) {
    case 1:
      return "error";
    case 2:
      return "warning";
    case 3:
      return "info";
    case 4:
      return "hint";
    default:
      return `severity:${severity}`;
  }
}

/** Format a single diagnostic message line. */
export function formatDiagnosticLine(diagnostic: {
  message: string;
  range: { start: { line: number } };
  severity?: number;
  source?: string;
}): string {
  const sev = diagnostic.severity ? diagnosticSeverityLabel(diagnostic.severity) : "error";
  const source = diagnostic.source ? ` [${diagnostic.source}]` : "";
  return `  ${diagnostic.range.start.line + 1}: ${sev}: ${diagnostic.message}${source}`;
}

/** Format an array of diagnostics. */
export function formatDiagnosticLines(
  diagnostics: Array<{
    message: string;
    range: { start: { line: number } };
    severity?: number;
    source?: string;
  }>,
): string {
  return diagnostics.map(formatDiagnosticLine).join("\n");
}

/** Format a workspace diagnostic summary entry. */
export function formatSummaryEntry(entry: {
  file: string;
  errors: number;
  warnings: number;
}): string {
  const parts: string[] = [];
  if (entry.errors > 0) parts.push(`${entry.errors} error${entry.errors > 1 ? "s" : ""}`);
  if (entry.warnings > 0) parts.push(`${entry.warnings} warning${entry.warnings > 1 ? "s" : ""}`);
  return `  ${entry.file}: ${parts.join(", ")}`;
}
