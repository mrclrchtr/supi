/** Session-owned unified code search workflow. */

import type { CodeSymbol } from "@mrclrchtr/supi-code-runtime/api";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";
import type { AutomaticLspPathPolicy } from "@mrclrchtr/supi-lsp/api";
import { SEMANTIC_READINESS_TIMEOUT_REASON } from "../analysis/readiness.ts";
import { resolveScopeSet } from "../analysis/search/paths.ts";
import { getStructuredPatternMatches } from "../analysis/search/pattern.ts";
import type { CodeFindAstKind } from "../tool/code_find/ast-kinds.ts";
import type { CapabilityAdapter } from "./capability-adapter.ts";
import type { FindWorkflowInput, FindWorkflowOutcome } from "./find-types.ts";
import { parseFindWorkflowInput } from "./input/workflows.ts";
import { resolveWorkspaceSemanticDemand } from "./semantic-demand.ts";
import { reportProgress, throwIfAborted, type WorkflowControl } from "./workflow-control.ts";

export interface FindWorkflowDeps {
  readonly cwd: string;
  readonly capability: CapabilityAdapter;
  /** Session-owned automatic path snapshot for broad AST work. */
  readonly automaticPathPolicy?: AutomaticLspPathPolicy;
}

/** Search one explicit substrate without silently falling back to another mode. */
export async function runFindWorkflow(
  input: FindWorkflowInput,
  deps: FindWorkflowDeps,
  control?: WorkflowControl,
): Promise<FindWorkflowOutcome> {
  const parsed = parseFindWorkflowInput(input);
  if (parsed.kind === "invalid-input") return parsed;
  const request = parsed.value;
  const mode = "ast" in request.search ? "ast" : "semantic";

  const scope = resolveScopeSet(request.scopes ? [...request.scopes] : undefined, deps.cwd);
  if (scope.kind === "error") return { kind: "invalid-input", message: scope.reason };

  if (mode === "ast") control?.signal?.throwIfAborted();
  else throwIfAborted(control);
  reportProgress(control, {
    intent: "find",
    phase: mode,
    message: `Searching in ${mode} mode`,
  });

  const maxResults = request.maxResults ?? 8;
  const scopeLabel = scope.display ?? ".";
  if ("semantic" in request.search) {
    return runSemanticSearch({
      query: request.search.semantic.query,
      scopePaths: scope.paths,
      scopeLabel,
      maxResults,
      deps,
      control,
    });
  }
  return runAstSearch({
    search: request.search.ast,
    scopePaths: scope.paths,
    scopeLabel,
    maxResults,
    deps,
    control,
  });
}

async function runSemanticSearch(options: {
  query: string;
  scopePaths: readonly string[];
  scopeLabel: string;
  maxResults: number;
  deps: FindWorkflowDeps;
  control?: WorkflowControl;
}): Promise<FindWorkflowOutcome> {
  const { query, scopePaths, scopeLabel, maxResults, deps, control } = options;
  const semanticDemand = await resolveWorkspaceSemanticDemand(deps.capability, deps.cwd, control);
  if (semanticDemand.kind === "timeout") {
    return { kind: "unavailable", reason: SEMANTIC_READINESS_TIMEOUT_REASON };
  }
  if (semanticDemand.kind === "unavailable") return semanticDemand;
  throwIfAborted(control);

  const result = await semanticDemand.provider.workspaceSymbols(query, control, scopePaths);
  // A cancellation that landed during the request must not publish symbols
  // the caller no longer awaits.
  throwIfAborted(control);
  if (result.kind === "unavailable") {
    return { kind: "unavailable", reason: result.reason };
  }
  const scopedSymbols: CodeSymbol[] = result.data.filter((symbol) =>
    scopePaths.some((scopePath) => isWithinOrEqual(scopePath, symbol.file)),
  );
  return {
    kind: "completed",
    query,
    mode: "semantic",
    scopeLabel,
    maxResults,
    data: {
      kind: "semantic",
      symbols: scopedSymbols,
      partialReason: result.kind === "partial" ? result.reason : null,
      ...(result.kind === "partial" && result.metadata ? { partialMetadata: result.metadata } : {}),
    },
  };
}

async function runAstSearch(options: {
  search: { readonly kind: CodeFindAstKind; readonly query: string };
  scopePaths: readonly string[];
  scopeLabel: string;
  maxResults: number;
  deps: FindWorkflowDeps;
  control?: WorkflowControl;
}): Promise<FindWorkflowOutcome> {
  const { search, scopePaths, scopeLabel, maxResults, deps, control } = options;
  const { kind, query } = search;
  const provider = deps.capability.getStructuralProvider(deps.cwd);
  if (!provider) {
    return { kind: "unavailable", reason: "No structural provider is active." };
  }
  control?.signal?.throwIfAborted();
  const outcome = await getStructuredPatternMatches({
    params: { pattern: query, kind },
    roots: scopePaths,
    cwd: deps.cwd,
    structural: provider,
    automaticPathPolicy: deps.automaticPathPolicy,
    control: {
      operationId: control?.operationId,
      signal: control?.signal,
      deadline: control?.deadline,
    },
  });
  if (outcome.kind === "invalid-input") return outcome;
  if (outcome.kind === "unavailable") return outcome;
  return {
    kind: "completed",
    query,
    mode: "ast",
    scopeLabel,
    maxResults,
    data: { kind: "ast", astKind: kind, result: outcome.result },
  };
}
