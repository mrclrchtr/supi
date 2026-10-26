import type { CodeIntelResult } from "../../types/index.ts";
import { formatSemanticHealthState } from "../code_health/semantic-state.ts";
import type { HealthDetails, SearchDetails } from "./types.ts";

/** Economic inline bound (approximately 2,000 tokens), independent of Pi's safety limit. */
export const MODEL_OUTPUT_MAX_CHARACTERS = 8_000;
const NOTICE_RESERVE = 1_024;
const MAX_FACT_CHARACTERS = 4_000;

type Details = NonNullable<CodeIntelResult["details"]>;

/** Preserve collection state and diagnostic snippets before a bounded, explicitly incomplete excerpt. */
export function boundModelContent(
  content: string,
  details: CodeIntelResult["details"],
): {
  text: string;
  truncated: boolean;
} {
  if (details?.modelBudgetManaged || content.length <= MODEL_OUTPUT_MAX_CHARACTERS) {
    return { text: content, truncated: false };
  }
  const lines = [
    "[truncated: model preview; read the saved output for full returned evidence.]",
    "Counts describe the returned result, not this shortened preview.",
  ];
  // Reserve diagnostic space before verbose limitations can exhaust the summary.
  // Single-line facts also keep Pi's later line bound from discarding late sections.
  if (details) lines.push(...diagnosticFacts(details).map((fact) => shortFact(fact, 320)));
  const facts = details ? summary(details) : [];
  for (let index = 0; index < facts.length; index++) {
    const fact = shortFact(facts[index], 256);
    if (lines.join("\n").length + fact.length > MAX_FACT_CHARACTERS) {
      lines.push(`Additional summary lines omitted: ${facts.length - index}.`);
      break;
    }
    lines.push(fact);
  }
  const header = `${lines.join("\n")}\n\n## Incomplete text excerpt\n`;
  const remaining = MODEL_OUTPUT_MAX_CHARACTERS - NOTICE_RESERVE - header.length;
  return { text: `${header}${shorten(content, remaining)}`, truncated: true };
}

function shorten(value: string, limit: number): string {
  if (value.length <= limit) return value;
  let end = Math.max(0, limit - 15);
  const unit = value.charCodeAt(end - 1);
  if (unit >= 0xd800 && unit <= 0xdbff) end--;
  return `${value.slice(0, end)}… [shortened]`;
}

function shortFact(value: string, limit: number): string {
  return shorten(value.replace(/\s+/gu, " "), limit);
}

function diagnosticFacts(details: Details): string[] {
  if (details.type === "inspect") {
    return (details.data.diagnostics ?? [])
      .slice(0, 3)
      .map(
        (diagnostic) =>
          `Diagnostic L${diagnostic.line}:${diagnostic.character} (severity=${diagnostic.severity}): ${diagnostic.message}`,
      );
  }
  if (details.type === "health") {
    const snippets: string[] = [];
    for (const entry of details.data.diagnosticObservation.entries) {
      for (const message of entry.messages ?? []) {
        snippets.push(`${entry.file}:${message.line} ${message.severity}: ${message.message}`);
        if (snippets.length === 3) return snippets;
      }
    }
    return snippets;
  }
  return [];
}

function summary(details: Details): string[] {
  const data = details.data;
  return [
    `Result status: ${details.status ?? "completed"}.`,
    ...(details.message ? [details.message] : []),
    ...("confidence" in data ? [`Confidence: ${data.confidence}.`] : []),
    ...(data.evidenceLists ?? []).map(
      (list) =>
        `${list.key}: returned=${list.shownCount}, total=${list.totalCount ?? "unknown"}, cap-omitted=${list.omittedCount ?? "unknown"}; partial=${list.partialReason ?? "none"}${list.invalidLocationCount ? `; invalid locations=${list.invalidLocationCount}` : ""}${list.partialMessage ? `; ${list.partialMessage}` : ""}`,
    ),
    ...sectionFacts(details),
  ];
}

function sectionFacts(details: Details): string[] {
  switch (details.type) {
    case "inspect": {
      const data = details.data;
      return [
        `Focus: ${data.focusTarget}; diagnostics window: ${data.diagnosticWindow ? `L${data.diagnosticWindow.startLine}–L${data.diagnosticWindow.endLine}` : "unavailable"}.`,
        ...data.sections.map(
          (section) =>
            `${section.key}: ${section.status}${section.reason ? ` — ${section.reason}` : ""}${section.recovery ? `; recovered syntax in ${section.recovery.file}` : ""}`,
        ),
      ];
    }
    case "graph":
      return [
        `Target: ${details.data.targetName} — ${details.data.targetFile}.`,
        ...details.data.sections.map(
          (section) =>
            `${section.rel} (${section.source}): ${section.status}; external=${section.externalCount}${section.depth ? `; depth=${section.depth}` : ""}${section.message ? `; ${section.message}` : ""}${section.recovery ? `; syntax recovery: ${section.recovery.reason}` : ""}`,
        ),
        "Callees are written source expressions, not resolved symbol identities; direct depth excludes nested scopes.",
      ];
    case "resolve":
      return [
        `${details.data.resultKind}: ${details.data.targetCount} targets; ${details.data.omittedCount} cap omissions.`,
        ...(details.data.groupPartialReason
          ? [`Partial discovery: ${details.data.groupPartialReason}`]
          : []),
        ...details.data.targets
          .slice(0, 3)
          .map(
            (target) =>
              `${target.targetId}: ${target.name ?? "anonymous"} ${target.file}:${target.displayLine}:${target.displayCharacter}; ${target.anchorKind} anchor; confidence=${target.confidence}; provenance=${target.provenance.join("+")}`,
          ),
      ];
    case "search":
      return searchFacts(details.data);
    case "health":
      return healthFacts(details.data);
    case "context":
      return [
        `Focus: ${details.data.focusTarget ?? "workspace"}.`,
        ...(details.data.sections ?? []).map(
          (section) =>
            `${section.title}: ${section.status}${section.reason ? ` — ${section.reason}` : ""}`,
        ),
      ];
  }
}

function searchFacts(data: SearchDetails): string[] {
  const scan = data.scan;
  const lines = [`Search scope: ${data.scope ?? "workspace"}.`];
  if (scan) {
    lines.push(
      `AST universe: ${scan.universe}; complete=${scan.complete}; eligible=${scan.eligibleFileCount ?? "unknown"}; analyzed=${scan.analyzedFileCount}.`,
      ...scan.limitations.map(
        (limit) => `Scan limitation: ${limit.reason}; paths=${limit.pathCount ?? "unknown"}.`,
      ),
      ...scan.exclusions.map(
        (exclusion) => `Policy exclusion: ${exclusion.reason}; paths=${exclusion.pathCount}.`,
      ),
    );
  }
  if (data.automaticPathExclusion)
    lines.push(`Automatic path exclusions: ${data.automaticPathExclusion.excludedCount}.`);
  if (data.structuralFailures?.length) {
    lines.push(
      `Structural failures: ${data.structuralFailures.length}.`,
      ...data.structuralFailures.slice(0, 3).map((failure) => `${failure.file}: ${failure.reason}`),
    );
  }
  return lines;
}

function healthFacts(data: HealthDetails): string[] {
  const observation = data.diagnosticObservation;
  const lines = [
    `LSP: ${formatSemanticHealthState(data.semanticState)}; structural: ${data.structuralStatus ?? String(data.structuralAvailable)}.`,
    `Server inventory is workspace-wide: ${data.serverCount}; routes: ${JSON.stringify(data.serverRouteStatusCounts)}.`,
    `Refresh: ${data.refresh.kind}. Maintenance recovery is separate from diagnostic confirmation.`,
  ];
  if ("reason" in data.refresh) lines.push(`Refresh reason: ${data.refresh.reason}`);
  if (observation.kind !== "not-requested") {
    const scope = observation.scope;
    lines.push(
      `Diagnostics: ${observation.kind}; ${scope.kind === "file" ? `file=${scope.path}` : `tracked-file snapshot; filter=${scope.filter ?? "none"}; not workspace-wide verification`}.`,
      `Diagnostic coverage: requested=${observation.evidence.requested}, confirmed=${observation.evidence.confirmed}, unconfirmed=${observation.evidence.unconfirmed}, failed=${observation.evidence.failed}, removed=${observation.evidence.removed}.`,
    );
    if ("reason" in observation) lines.push(`Diagnostic limitation: ${observation.reason}`);
    if (observation.scopeStatus)
      lines.push(`File scope status: ${JSON.stringify(observation.scopeStatus)}`);
  }
  if (data.capabilityWarnings?.hasWarnings)
    lines.push(
      `Capability warnings: ${data.capabilityWarnings.warnings.length}.`,
      ...data.capabilityWarnings.warnings.slice(0, 3).map((warning) => warning.message),
    );
  return lines;
}
