/** Session-owned unified code search workflow. */

import type { CodeSymbol } from "@mrclrchtr/supi-code-runtime/api";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";
import { SEMANTIC_READINESS_TIMEOUT_REASON } from "../analysis/readiness.ts";
import { resolveScopeSet } from "../analysis/search/paths.ts";
import { getStructuredPatternMatches } from "../analysis/search/pattern.ts";
import { isCodeFindAstKind } from "../tool/code_find/ast-kinds.ts";
import type { CapabilityAdapter } from "./capability-adapter.ts";
import type { FindWorkflowInput, FindWorkflowOutcome } from "./find-types.ts";
import { parseFindWorkflowInput } from "./input/workflows.ts";
import { reportProgress, throwIfAborted, type WorkflowControl } from "./workflow-control.ts";

export interface FindWorkflowDeps {
  readonly cwd: string;
  readonly capability: CapabilityAdapter;
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
  const query = request.query;
  const mode = request.mode;

  const scope = resolveScopeSet(request.scope ? [...request.scope] : undefined, deps.cwd);
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
  if (mode === "semantic") {
    return runSemanticSearch({
      query,
      scopePaths: scope.paths,
      scopeLabel,
      maxResults,
      deps,
      control,
    });
  }
  return runAstSearch({
    query,
    input: request,
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
  const readiness = await deps.capability.ensureSemanticReadiness(
    deps.cwd,
    { kind: "workspace" },
    control,
  );
  if (readiness.kind === "timeout") {
    return { kind: "unavailable", reason: SEMANTIC_READINESS_TIMEOUT_REASON };
  }
  if (readiness.kind === "unavailable") return readiness;
  throwIfAborted(control);

  const provider = deps.capability.getSemanticProvider(deps.cwd);
  if (!provider?.workspaceSymbols) {
    return { kind: "unavailable", reason: "No semantic workspace-symbol provider is active." };
  }
  const result = await provider.workspaceSymbols(query, control);
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
    },
  };
}

async function runAstSearch(options: {
  query: string;
  input: FindWorkflowInput;
  scopePaths: readonly string[];
  scopeLabel: string;
  maxResults: number;
  deps: FindWorkflowDeps;
  control?: WorkflowControl;
}): Promise<FindWorkflowOutcome> {
  const { query, input, scopePaths, scopeLabel, maxResults, deps, control } = options;
  if (!isCodeFindAstKind(input.kind)) {
    return { kind: "invalid-input", message: "Unsupported AST kind." };
  }
  const provider = deps.capability.getStructuralProvider(deps.cwd);
  if (!provider) {
    return { kind: "unavailable", reason: "No structural provider is active." };
  }
  control?.signal?.throwIfAborted();
  const outcome = await getStructuredPatternMatches({
    params: { pattern: query, kind: input.kind },
    roots: scopePaths,
    cwd: deps.cwd,
    structural: provider,
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
    data: { kind: "ast", astKind: input.kind, result: outcome.result },
  };
}
