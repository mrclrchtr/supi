import { renderEvidenceListDisclosure } from "../../analysis/evidence.ts";
import type { InspectObservation } from "../../session/inspect-types.ts";
import type { InspectResultAssembly } from "./result.ts";

export function renderInspectResult(assembly: InspectResultAssembly): string {
  const input = assembly.data;
  const lines = [
    `# Inspect: ${input.relPath}:${input.line}:${input.character}`,
    "",
    `**Confidence:** \`${input.confidence}\``,
    "",
  ];

  renderNode(lines, input, input.sections.node);
  renderEnclosingSymbol(lines, input.sections.enclosingSymbol);
  renderHover(lines, input.sections.hover);
  renderDefinitions(lines, assembly);
  renderDiagnostics(lines, assembly);
  return lines.join("\n");
}

function renderNode(
  lines: string[],
  input: InspectResultAssembly["data"],
  observation: InspectResultAssembly["data"]["sections"]["node"],
): void {
  lines.push("## Syntax node");
  if (observation.kind === "unavailable") {
    appendUnavailable(lines, observation);
    return;
  }
  appendPartial(lines, observation);
  const node = observation.data;
  if (!node) {
    lines.push("_No syntax node at this point._", "");
    return;
  }
  lines.push(
    `- Type: \`${node.type}\` at ${input.relPath}:${node.startLine}:${node.startCharacter}–${node.endLine}:${node.endCharacter}`,
  );
  if (node.text) lines.push("```ts", node.text, "```");
  if (node.ancestry.length > 0) {
    lines.push("", "### Ancestry");
    for (const ancestor of node.ancestry) {
      lines.push(
        `- \`${ancestor.type} L${ancestor.startLine}:${ancestor.startCharacter}–L${ancestor.endLine}:${ancestor.endCharacter}\``,
      );
    }
  }
  lines.push("");
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
  const symbol = observation.data;
  if (!symbol) {
    lines.push("_No provider-reported declaration encloses this point._", "");
    return;
  }
  lines.push(
    `- \`${symbol.name}\` (${symbol.kind}) L${symbol.startLine}:${symbol.startCharacter}–L${symbol.endLine}:${symbol.endCharacter}`,
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
  lines.push(observation.data ?? "_No hover result at this point._", "");
}

function renderDefinitions(lines: string[], assembly: InspectResultAssembly): void {
  const observation = assembly.data.sections.definition;
  lines.push("## Definition");
  if (appendUnavailable(lines, observation)) return;
  appendPartial(lines, observation);
  if (assembly.displayedDefinitions.length === 0) {
    lines.push("_No definition result at this point._");
  } else {
    for (const definition of assembly.displayedDefinitions) {
      lines.push(`- \`${definition.file}:${definition.line}:${definition.character}\``);
    }
  }
  const disclosure = assembly.definitionEvidence
    ? renderEvidenceListDisclosure(assembly.definitionEvidence)
    : null;
  if (disclosure) lines.push("", disclosure);
  lines.push("");
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
