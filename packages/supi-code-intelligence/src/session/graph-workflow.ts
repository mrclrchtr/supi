/** Session-owned graph workflow: one Target workflow followed by relation collection. */

import { toDisplayPath } from "../analysis/search/paths.ts";
import type { CapabilityAdapter } from "./capability-adapter.ts";
import { collectRelation } from "./graph/collect.ts";
import type {
  GraphRelationKind,
  GraphSection,
  GraphWorkflowInput,
  GraphWorkflowOutcome,
} from "./graph-types.ts";
import { parseGraphWorkflowInput } from "./input/workflows.ts";
import type { TargetInput } from "./target-input.ts";
import {
  resolveTargetWorkflow,
  type TargetWorkflowDeps,
  type TargetWorkflowOutcome,
} from "./target-workflow.ts";
import { reportProgress, throwIfAborted, type WorkflowControl } from "./workflow-control.ts";

const DEFAULT_RELATIONS: readonly GraphRelationKind[] = ["references"];
const ALL_RELATIONS: readonly GraphRelationKind[] = ["references", "callees", "implements"];

export interface GraphWorkflowDeps extends TargetWorkflowDeps {
  readonly capability: CapabilityAdapter;
}

/** Execute graph analysis without assembling or rendering a public Tool result. */
export async function runGraphWorkflow(
  input: GraphWorkflowInput,
  deps: GraphWorkflowDeps,
  control?: WorkflowControl,
): Promise<GraphWorkflowOutcome> {
  const parsed = parseGraphWorkflowInput(input);
  if (parsed.kind === "invalid-input") return parsed;
  const request = parsed.value;
  const relations = normalizeRelations(request.relations);
  if (typeof relations === "string") {
    return { kind: "invalid-input", message: relations };
  }

  throwIfAborted(control);
  reportProgress(control, {
    intent: "graph",
    phase: "target",
    message: "Resolving graph target",
  });

  const targetOutcome = await resolveTargetWorkflow(
    request.target as TargetInput,
    {
      fileLevelAllowed: false,
      nameAnchorRequired: false,
      maxResults: request.maxResults,
    },
    deps,
    control,
  );
  throwIfAborted(control);
  if (targetOutcome.kind === "target-group") {
    return {
      kind: "invalid-input",
      message: "Graph analysis requires one member handle from a Target group.",
    };
  }
  if (targetOutcome.kind !== "resolved") return targetOutcome;

  const entry = targetOutcome.entry;
  const semanticReadinessError = await getSemanticReadinessError({
    relations,
    file: entry.file,
    capability: deps.capability,
    cwd: deps.cwd,
    control,
  });
  const provider = deps.capability.getProvider(deps.cwd);
  const maxResults = request.maxResults ?? 8;
  const displayName =
    entry.name ?? `symbol at ${toDisplayPath(deps.cwd, entry.file)}:${entry.displayLine}`;

  const sections: GraphSection[] = [];
  for (const relation of relations) {
    throwIfAborted(control);
    reportProgress(control, {
      intent: "graph",
      phase: relation,
      message: `Collecting ${relation}`,
    });
    sections.push(
      await collectRelation(relation, {
        file: entry.file,
        position: entry.position,
        displayName,
        cwd: deps.cwd,
        provider,
        maxResults,
        semanticReadinessError,
        anchorKind: entry.anchorKind,
        calleeDepth: request.calleeDepth,
        requestControl: control,
      }),
    );
  }
  throwIfAborted(control);

  if (sections.length > 0 && sections.every((section) => section.kind === "unavailable")) {
    return {
      kind: "unavailable",
      reason: sections.map((section) => section.message).join("; "),
    };
  }

  return Object.freeze({
    kind: "completed",
    displayName,
    resolvedDisplayFile: toDisplayPath(deps.cwd, entry.file),
    maxResults,
    sections: Object.freeze(sections),
  });
}

function normalizeRelations(
  requested: readonly (GraphRelationKind | "all")[] | undefined,
): readonly GraphRelationKind[] | string {
  if (!requested || requested.length === 0) return DEFAULT_RELATIONS;
  if (requested.includes("all")) {
    if (requested.length !== 1) {
      return '`relations: ["all"]` cannot be combined with named relations.';
    }
    return ALL_RELATIONS;
  }
  return requested as readonly GraphRelationKind[];
}

async function getSemanticReadinessError(options: {
  relations: readonly GraphRelationKind[];
  file: string;
  capability: CapabilityAdapter;
  cwd: string;
  control?: WorkflowControl;
}): Promise<string | null> {
  const { relations, file, capability, cwd, control } = options;
  if (!relations.some((relation) => relation === "references" || relation === "implements")) {
    return null;
  }
  const readiness = await capability.ensureSemanticReadiness(cwd, { kind: "file", file }, control);
  if (readiness.kind === "ready") return null;
  if (readiness.kind === "timeout") {
    return "Semantic readiness timed out. Retry shortly or inspect code_health.";
  }
  return readiness.reason;
}

/** Narrow helper retained for session method typing. */
export function isTargetFailure(
  outcome: TargetWorkflowOutcome,
): outcome is Exclude<TargetWorkflowOutcome, { kind: "resolved" } | { kind: "target-group" }> {
  return outcome.kind !== "resolved" && outcome.kind !== "target-group";
}
