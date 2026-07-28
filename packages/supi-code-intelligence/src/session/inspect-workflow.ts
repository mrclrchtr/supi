/** Session-owned point inspection workflow. */

import type { WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import type { CapabilityAdapter, ReadinessOutcome } from "./capability-adapter.ts";
import { parseInspectWorkflowInput } from "./input/workflows.ts";
import { collectInspectSections } from "./inspect/collect.ts";
import { validateInspectPoint } from "./inspect/file-point.ts";
import type {
  InspectDefinition,
  InspectResultData,
  InspectSections,
  InspectWorkflowInput,
  InspectWorkflowOutcome,
} from "./inspect-types.ts";
import { reportProgress, throwIfAborted, type WorkflowControl } from "./workflow-control.ts";

export interface InspectWorkflowDeps {
  readonly cwd: string;
  readonly capability: CapabilityAdapter;
}

/** Collect exact point facts without assembling or rendering a Tool result. */
export async function runInspectWorkflow(
  input: InspectWorkflowInput,
  deps: InspectWorkflowDeps,
  control?: WorkflowControl,
): Promise<InspectWorkflowOutcome> {
  const parsed = parseInspectWorkflowInput(input);
  if (parsed.kind === "invalid-input") return parsed;
  const request = parsed.value;
  const point = validateInspectPoint(request.point, deps.cwd);
  if (point.kind === "invalid-input") return point;
  throwIfAborted(control);

  reportProgress(control, {
    intent: "inspect",
    phase: "providers",
    message: "Collecting point facts",
  });
  const readiness = await deps.capability.ensureSemanticReadiness(deps.cwd, {
    kind: "file",
    file: point.value.file,
  });
  throwIfAborted(control);

  const semanticReady = readiness.kind === "ready";
  const semantic = semanticReady ? deps.capability.getSemanticProvider(deps.cwd) : null;
  const lspState = semanticReady
    ? deps.capability.getLspRuntimeState(deps.cwd)
    : unavailableLspState(readiness);
  const sections = await collectInspectSections({
    cwd: deps.cwd,
    file: point.value.file,
    line: point.value.line,
    character: point.value.character,
    lineCount: point.value.lineCount,
    structural: deps.capability.getStructuralProvider(deps.cwd),
    semantic,
    semanticUnavailableReason: semantic
      ? "Semantic point query unavailable."
      : semanticReadinessReason(readiness),
    lspState,
  });
  throwIfAborted(control);

  if (everySectionUnavailable(sections)) {
    return {
      kind: "unavailable",
      reason: "No semantic, structural, or diagnostic provider could inspect this point.",
    };
  }

  const data: InspectResultData = {
    relPath: point.value.relPath,
    line: point.value.line,
    character: point.value.character,
    maxResults: request.maxResults ?? 5,
    confidence: inspectConfidence(sections),
    diagnosticWindow: {
      startLine: Math.max(1, point.value.line - 2),
      endLine: Math.min(point.value.lineCount, point.value.line + 2),
    },
    sections,
  };
  const definitions =
    sections.definition.kind === "unavailable" ? [] : [...sections.definition.data];

  return {
    kind: "completed",
    data,
    nextQueries: Object.freeze(buildInspectNextQueries(data.relPath, definitions, semanticReady)),
  };
}

function buildInspectNextQueries(
  relPath: string,
  definitions: readonly InspectDefinition[],
  semanticReady: boolean,
): string[] {
  const queries: string[] = [];
  const definition = definitions[0];
  if (semanticReady && definition) {
    const anchor = JSON.stringify({
      file: definition.file,
      line: definition.line,
      character: definition.character,
    });
    queries.push(
      `Use code_resolve with target.anchor ${anchor}, then code_graph with the returned handle`,
    );
  } else if (!semanticReady) {
    queries.push(
      `Use code_health with scope "${relPath}", refresh true, and include ["diagnostics","servers"] before semantic target or graph work`,
    );
  }
  queries.push(`Use code_orientation with focus.path "${relPath}" for broader orientation`);
  return queries;
}

function everySectionUnavailable(sections: InspectSections): boolean {
  return (
    sections.node.kind === "unavailable" &&
    sections.enclosingSymbol.kind === "unavailable" &&
    sections.hover.kind === "unavailable" &&
    sections.definition.kind === "unavailable" &&
    sections.diagnostics.kind === "unavailable"
  );
}

function inspectConfidence(sections: InspectSections): InspectResultData["confidence"] {
  const semanticAvailable =
    sections.hover.kind !== "unavailable" ||
    sections.definition.kind !== "unavailable" ||
    sections.diagnostics.kind !== "unavailable";
  if (semanticAvailable) return "semantic";
  const structuralAvailable =
    sections.node.kind !== "unavailable" || sections.enclosingSymbol.kind !== "unavailable";
  return structuralAvailable ? "structural" : "unavailable";
}

function unavailableLspState(readiness: ReadinessOutcome): WorkspaceLspRuntimeState {
  return {
    kind: "unavailable",
    reason: semanticReadinessReason(readiness),
  };
}

function semanticReadinessReason(readiness: ReadinessOutcome): string {
  switch (readiness.kind) {
    case "ready":
      return "No semantic provider is active for this file.";
    case "timeout":
      return "Semantic readiness timed out.";
    case "unavailable":
      return readiness.reason;
  }
}
