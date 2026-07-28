/** Session-owned point inspection workflow. */

import { existsSync } from "node:fs";
import { relative } from "node:path";
import { uriToFile } from "@mrclrchtr/supi-core/path";
import { normalizePath } from "../analysis/search/paths.ts";
import { gatherNearbyDiagnostics, gatherTreeSitterContext } from "../ui/markdown/gather.ts";
import type { CapabilityAdapter } from "./capability-adapter.ts";
import { parseInspectWorkflowInput } from "./input/workflows.ts";
import type {
  InspectResultData,
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
  throwIfAborted(control);
  const point = request.point;
  const resolvedFile = normalizePath(point.file, deps.cwd);
  if (!existsSync(resolvedFile)) {
    return { kind: "invalid-input", message: `File not found: \`${point.file}\`` };
  }

  reportProgress(control, {
    intent: "inspect",
    phase: "providers",
    message: "Collecting point facts",
  });
  const readiness = await deps.capability.ensureSemanticReadiness(deps.cwd, {
    kind: "file",
    file: resolvedFile,
  });
  throwIfAborted(control);

  const semanticReady = readiness.kind === "ready";
  const provider = semanticReady
    ? deps.capability.getProvider(deps.cwd)
    : deps.capability.getStructuralProvider(deps.cwd);
  const lspState = semanticReady
    ? deps.capability.getLspRuntimeState(deps.cwd)
    : {
        kind: "unavailable" as const,
        reason: readiness.kind === "timeout" ? "Semantic readiness timed out" : readiness.reason,
      };
  const relPath = relative(deps.cwd, resolvedFile);
  const context = await gatherTreeSitterContext(provider, relPath, point.line, point.character);
  const diagnostics = await gatherNearbyDiagnostics(
    deps.cwd,
    relPath,
    point.line,
    request.maxResults ?? 5,
    lspState,
  );
  const enclosing = context.outline.find(
    (item) => item.startLine <= point.line && item.endLine >= point.line,
  );
  const definitions = mapDefinitions(context.definition, deps.cwd);
  const unavailableSections = collectUnavailableSections({
    context,
    provider,
    definitions,
    diagnostics,
    lspReady: lspState.kind === "ready",
  });
  const evidence = inspectEvidenceState(
    context,
    definitions.length,
    Boolean(enclosing),
    diagnostics.length,
  );
  if (!evidence.available) {
    return {
      kind: "unavailable",
      reason: "No semantic, structural, or diagnostic provider could inspect this point.",
    };
  }

  const data: InspectResultData = {
    relPath,
    line: point.line,
    character: point.character,
    confidence: evidence.confidence,
    node: context.nodeInfo,
    enclosingSymbol: enclosing
      ? {
          name: enclosing.name,
          kind: enclosing.kind,
          startLine: enclosing.startLine,
          endLine: enclosing.endLine,
        }
      : null,
    hover: context.hover?.contents ?? null,
    definitions,
    diagnostics,
    unavailableSections: [...new Set(unavailableSections)],
  };

  return {
    kind: "completed",
    data,
    nextQueries: Object.freeze(buildInspectNextQueries(relPath, definitions, semanticReady)),
  };
}

function buildInspectNextQueries(
  relPath: string,
  definitions: InspectResultData["definitions"],
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

function mapDefinitions(
  definitions: Awaited<ReturnType<typeof gatherTreeSitterContext>>["definition"],
  cwd: string,
): InspectResultData["definitions"] {
  return (definitions ?? []).map((definition) => {
    const file = uriToFile(definition.uri);
    return {
      file: relative(cwd, file),
      line: definition.range.start.line + 1,
      character: definition.range.start.character + 1,
    };
  });
}

function collectUnavailableSections(options: {
  context: Awaited<ReturnType<typeof gatherTreeSitterContext>>;
  provider: Parameters<typeof gatherTreeSitterContext>[0];
  definitions: InspectResultData["definitions"];
  diagnostics: InspectResultData["diagnostics"];
  lspReady: boolean;
}): string[] {
  const { context, provider, definitions, diagnostics, lspReady } = options;
  const unavailable: string[] = [];
  if (!context.nodeInfo && context.outline.length === 0) unavailable.push("syntax");
  if (!context.hover && provider?.hover == null) unavailable.push("hover");
  if (definitions.length === 0 && provider?.definition == null) unavailable.push("definition");
  if (diagnostics.length === 0 && !lspReady) unavailable.push("diagnostics");
  return unavailable;
}

function inspectEvidenceState(
  context: Awaited<ReturnType<typeof gatherTreeSitterContext>>,
  definitionCount: number,
  hasEnclosing: boolean,
  diagnosticCount: number,
): { available: boolean; confidence: InspectResultData["confidence"] } {
  const semantic = Boolean(context.hover || definitionCount > 0);
  const structural = Boolean(context.nodeInfo || hasEnclosing);
  const diagnostics = diagnosticCount > 0;
  return {
    available: semantic || structural || diagnostics,
    confidence: semantic || diagnostics ? "semantic" : "structural",
  };
}
