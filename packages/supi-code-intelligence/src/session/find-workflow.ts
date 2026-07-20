/** Session-owned unified code search workflow. */

import type { CodeSymbol } from "@mrclrchtr/supi-code-runtime/api";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";
import { getStructuredPatternMatches } from "../analysis/search/pattern.ts";
import { resolveScopeSet, runRipgrepDetailed, toDisplayPath } from "../analysis/search/ripgrep.ts";
import { isCodeFindAstKind } from "../tool/find/ast-kinds.ts";
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
  const mode = request.mode ?? "text";

  const scope = resolveScopeSet(request.scope ? [...request.scope] : undefined, deps.cwd);
  if (scope.kind === "error") return { kind: "invalid-input", message: scope.reason };

  throwIfAborted(control);
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
  if (mode === "ast") {
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

  const contextLines = request.contextLines ?? 1;
  const result = await runRipgrepDetailed(query, scope.paths, deps.cwd, {
    contextLines,
    literal: mode === "text",
    filterLowSignal: true,
    signal: control?.signal,
  });
  if (result.error) {
    return mode === "regex"
      ? { kind: "invalid-input", message: result.error }
      : { kind: "unavailable", reason: result.error };
  }
  return {
    kind: "completed",
    query,
    mode,
    scopeLabel,
    maxResults,
    data: {
      kind: mode,
      matches: result.matches.map((match) => ({
        ...match,
        file: toDisplayPath(deps.cwd, match.file),
      })),
      partialReason: result.partialReason,
    },
  };
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
  const readiness = await deps.capability.ensureSemanticReadiness(deps.cwd, {
    kind: "workspace",
  });
  if (readiness.kind === "timeout") {
    return { kind: "unavailable", reason: "Semantic readiness timed out." };
  }
  if (readiness.kind === "unavailable") return readiness;
  throwIfAborted(control);

  const provider = deps.capability.getSemanticProvider(deps.cwd);
  if (!provider?.workspaceSymbols) {
    return { kind: "unavailable", reason: "No semantic workspace-symbol provider is active." };
  }
  const symbols = await provider.workspaceSymbols(query);
  if (symbols === null) {
    return { kind: "unavailable", reason: "Workspace-symbol search is unavailable." };
  }
  const scopedSymbols: CodeSymbol[] = symbols.filter((symbol) =>
    scopePaths.some((scopePath) => isWithinOrEqual(scopePath, symbol.file)),
  );
  return {
    kind: "completed",
    query,
    mode: "semantic",
    scopeLabel,
    maxResults,
    data: { kind: "semantic", symbols: scopedSymbols },
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
  throwIfAborted(control);
  const result = await getStructuredPatternMatches(
    { pattern: query, kind: input.kind },
    scopePaths,
    deps.cwd,
    scopeLabel,
    provider,
  );
  if (typeof result === "string") return { kind: "unavailable", reason: result };
  if (!result) return { kind: "unavailable", reason: "Structured search returned no result." };
  return {
    kind: "completed",
    query,
    mode: "ast",
    scopeLabel,
    maxResults,
    data: { kind: "ast", astKind: input.kind, result },
  };
}
