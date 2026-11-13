import { renderEvidenceListDisclosure } from "../../analysis/evidence.ts";
import type { InspectDefinition, InspectObservation } from "../../session/inspect-types.ts";
import type { InspectResultAssembly } from "./result.ts";

export function renderInspectResult(assembly: InspectResultAssembly): string {
  const input = assembly.data;
  const lines = [
    `# Inspect: ${input.relPath}:${input.line}:${input.character}`,
    "",
    `**Confidence:** \`${input.confidence}\``,
    "",
  ];

  renderNode(lines, input.sections.node);
  renderEnclosingSymbol(lines, input.sections.enclosingSymbol);
  renderHover(lines, input.sections.hover);
  renderDefinitions(lines, assembly);
  renderDiagnostics(lines, assembly);
  return lines.join("\n");
}

function renderNode(
  lines: string[],
  observation: InspectResultAssembly["data"]["sections"]["node"],
): void {
  lines.push("## Syntax node");
  if (observation.kind === "unavailable") {
    appendUnavailable(lines, observation);
    return;
  }
  appendPartial(lines, observation);
  appendSyntaxRecovery(lines, observation.recovery);
  const node = observation.data;
  if (!node) {
    lines.push("_No syntax node at this anchor._", "");
    return;
  }
  lines.push(
    `- \`${node.type}\` L${node.startLine}:${node.startCharacter}–L${node.endLine}:${node.endCharacter}`,
  );
  if (node.text) appendNodeText(lines, node);
  if (node.ancestry.length > 0) {
    lines.push(
      `Ancestry: ${node.ancestry.map((ancestor) => `\`${ancestor.type} L${ancestor.startLine}:${ancestor.startCharacter}–L${ancestor.endLine}:${ancestor.endCharacter}\``).join(" > ")}`,
    );
  }
  lines.push("");
}

/** Preview bounds for syntax-node text; a whitespace anchor selects the whole file's root node. */
const NODE_TEXT_MAX_LINES = 12;
const NODE_TEXT_MAX_CHARACTERS = 1200;

/** Print a bounded preview of the node text; the range above locates the rest. */
function appendNodeText(
  lines: string[],
  node: { text: string; startLine: number; endLine: number },
): void {
  const textLines = node.text.split("\n");
  let shown = textLines.slice(0, NODE_TEXT_MAX_LINES).join("\n");
  // Array.from keeps surrogate pairs whole when a single long line is cut.
  const characters = Array.from(shown);
  if (characters.length > NODE_TEXT_MAX_CHARACTERS) {
    shown = characters.slice(0, NODE_TEXT_MAX_CHARACTERS).join("");
  }
  lines.push("```text", shown, "```");
  if (shown.length === node.text.length) return;
  const preview =
    textLines.length > NODE_TEXT_MAX_LINES
      ? `first ${NODE_TEXT_MAX_LINES} of ${textLines.length} lines`
      : `first ${NODE_TEXT_MAX_CHARACTERS} characters`;
  lines.push(
    `_Node text shortened to the ${preview}; read L${node.startLine}–L${node.endLine} for the rest._`,
  );
}

function renderEnclosingSymbol(
  lines: string[],
  observation: InspectResultAssembly["data"]["sections"]["enclosingSymbol"],
): void {
  lines.push("## Enclosing symbol");
  if (observation.kind === "unavailable") {
    appendUnavailable(lines, observation);
    return;
  }
  appendPartial(lines, observation);
  appendSyntaxRecovery(lines, observation.recovery);
  const symbol = observation.data;
  if (!symbol) {
    lines.push("_No provider-reported declaration encloses this anchor._", "");
    return;
  }
  lines.push(
    `- \`${symbol.name}\` (${symbol.nativeKind ?? symbol.kind}) L${symbol.startLine}:${symbol.startCharacter}–L${symbol.endLine}:${symbol.endCharacter}`,
    "",
  );
}

function renderHover(
  lines: string[],
  observation: InspectResultAssembly["data"]["sections"]["hover"],
): void {
  lines.push("## Hover");
  if (observation.kind === "unavailable") {
    appendUnavailable(lines, observation);
    return;
  }
  appendPartial(lines, observation);
  lines.push(observation.data ?? "_No hover result at this anchor._", "");
}

function renderDefinitions(lines: string[], assembly: InspectResultAssembly): void {
  const observation = assembly.data.sections.definition;
  lines.push("## Definition");
  if (appendUnavailable(lines, observation)) return;
  appendPartial(lines, observation);
  if (assembly.displayedDefinitions.length === 0) {
    lines.push("_No definition result at this anchor._");
  } else {
    for (const definition of assembly.displayedDefinitions) {
      lines.push(`- ${formatDefinition(definition, assembly.data)}`);
    }
  }
  const disclosure = assembly.definitionEvidence
    ? renderEvidenceListDisclosure(assembly.definitionEvidence)
    : null;
  if (disclosure) lines.push("", disclosure);
  lines.push("");
}

function formatDefinition(
  definition: InspectDefinition,
  focus: InspectResultAssembly["data"],
): string {
  if (definition.file !== focus.relPath) {
    return `\`${definition.file}:${definition.line}:${definition.character}\``;
  }
  if (definition.line === focus.line && definition.character === focus.character)
    return "Same anchor";
  return `L${definition.line}:${definition.character}`;
}

function renderDiagnostics(lines: string[], assembly: InspectResultAssembly): void {
  const observation = assembly.data.sections.diagnostics;
  const window = assembly.data.diagnosticWindow;
  lines.push(`## Diagnostics (L${window.startLine}–L${window.endLine})`);
  if (appendUnavailable(lines, observation)) return;
  appendPartial(lines, observation);
  if (assembly.displayedDiagnostics.length === 0) {
    lines.push("_No diagnostics intersect the nearby window._");
  } else {
    for (const diagnostic of assembly.displayedDiagnostics) {
      lines.push(
        `- L${diagnostic.line}:${diagnostic.character}: ${formatSeverity(diagnostic.severity)}: ${diagnostic.message}`,
      );
    }
  }
  const disclosure = assembly.diagnosticEvidence
    ? renderEvidenceListDisclosure(assembly.diagnosticEvidence)
    : null;
  if (disclosure) lines.push("", disclosure);
  lines.push("");
}

function appendSyntaxRecovery(
  lines: string[],
  recovery: InspectObservation<unknown>["recovery"],
): void {
  if (!recovery) return;
  const locations = recovery.errorRanges.map(
    (range) => `L${range.start.line + 1}:${range.start.character + 1}`,
  );
  const suffix = locations.length > 0 ? ` Error locations: ${locations.join(", ")}.` : "";
  lines.push(`_Recovered syntax in \`${recovery.file}\`.${suffix}_`, "");
}

function appendUnavailable(lines: string[], observation: InspectObservation<unknown>): boolean {
  if (observation.kind !== "unavailable") return false;
  lines.push(`_Unavailable — ${observation.reason}_`, "");
  return true;
}

function appendPartial(lines: string[], observation: InspectObservation<unknown>): void {
  if (observation.kind === "partial") lines.push(`_Partial — ${observation.reason}_`, "");
}

function formatSeverity(severity: number): string {
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
