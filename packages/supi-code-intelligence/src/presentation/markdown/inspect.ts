import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";

export interface InspectRenderInput {
  relPath: string;
  line: number;
  character: number;
  confidence: ConfidenceMode;
  node: {
    type: string;
    text: string;
    startLine: number;
    startCharacter: number;
    ancestry?: Array<
      | string
      | {
          type: string;
          startLine: number;
          startCharacter: number;
          endLine?: number;
          endCharacter?: number;
        }
    >;
  } | null;
  enclosingSymbol: {
    name: string;
    kind: string;
    startLine: number;
    endLine: number;
  } | null;
  hover: string | null;
  definitions: Array<{ file: string; line: number; character: number }>;
  diagnostics: Array<{ line: number; severity: number | string; message: string }>;
  codeActions: Array<{ title: string; kind?: string }>;
  unavailableSections: string[];
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: inspect rendering keeps section ordering and unavailable-state handling explicit
export function renderInspectResult(input: InspectRenderInput): string {
  const lines: string[] = [];
  lines.push(`# Inspect: ${input.relPath}:${input.line}:${input.character}`);
  lines.push("");
  lines.push(`**Confidence:** \`${input.confidence}\``);
  lines.push("");

  if (input.node) {
    lines.push("## Node");
    lines.push(
      `- Type: \`${input.node.type}\` at ${input.relPath}:${input.node.startLine}:${input.node.startCharacter}`,
    );
    if (input.node.text) {
      lines.push("```ts");
      lines.push(input.node.text);
      lines.push("```");
    }
    const ancestry = normalizeAncestry(input.node.ancestry ?? []);
    if (ancestry.length > 0) {
      lines.push("");
      lines.push("### Ancestry");
      for (const ancestor of ancestry) {
        lines.push(`- \`${ancestor}\``);
      }
    }
    lines.push("");
  }

  if (input.enclosingSymbol) {
    lines.push("## Enclosing symbol");
    lines.push(
      `- \`${input.enclosingSymbol.name}\` (${input.enclosingSymbol.kind}) L${input.enclosingSymbol.startLine}–${input.enclosingSymbol.endLine}`,
    );
    lines.push("");
  }

  if (input.hover) {
    lines.push("## Hover");
    lines.push(input.hover);
    lines.push("");
  }

  if (input.definitions.length > 0) {
    lines.push("## Definition");
    for (const def of input.definitions) {
      lines.push(`- \`${def.file}:${def.line}:${def.character}\``);
    }
    lines.push("");
  }

  if (input.diagnostics.length > 0) {
    lines.push("## Diagnostics");
    for (const diagnostic of input.diagnostics) {
      lines.push(
        `- L${diagnostic.line}: ${formatSeverity(diagnostic.severity)}: ${diagnostic.message}`,
      );
    }
    lines.push("");
  }

  if (input.codeActions.length > 0) {
    lines.push("## Code Actions");
    for (const action of input.codeActions) {
      const kind = action.kind ? ` (${action.kind})` : "";
      lines.push(`- "${action.title}"${kind}`);
    }
    lines.push("");
  }

  if (input.unavailableSections.length > 0) {
    lines.push("## Unavailable");
    for (const section of input.unavailableSections) {
      lines.push(`- ${section}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function normalizeAncestry(
  ancestry: Array<
    | string
    | {
        type: string;
        startLine: number;
        startCharacter: number;
        endLine?: number;
        endCharacter?: number;
      }
  >,
): string[] {
  return ancestry.map((entry) => {
    if (typeof entry === "string") return entry;
    const start = `L${entry.startLine}:${entry.startCharacter}`;
    const end =
      entry.endLine != null && entry.endCharacter != null
        ? `–L${entry.endLine}:${entry.endCharacter}`
        : "";
    return `${entry.type} ${start}${end}`;
  });
}

function formatSeverity(severity: number | string): string {
  if (typeof severity === "string") {
    return severity.charAt(0).toUpperCase() + severity.slice(1);
  }

  switch (severity) {
    case 1:
      return "Error";
    case 2:
      return "Warning";
    case 3:
      return "Info";
    case 4:
      return "Hint";
    default:
      return "Diagnostic";
  }
}
