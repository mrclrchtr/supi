import {
  type CodeQueryPartialMetadata,
  type CodeQueryResult,
  type CodeRequestControl,
  completedCodeQuery,
  partialCodeQuery,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import type { LspClient } from "../client/client.ts";
import type { SymbolInformation, WorkspaceSymbol } from "../config/types.ts";
import { nativeTypeScriptRowLimit } from "./workspace-symbol-row-limit.ts";

type WorkspaceSymbolLike = SymbolInformation | WorkspaceSymbol;

export interface WorkspaceSymbolCollection {
  results: WorkspaceSymbolLike[];
  hasSupport: boolean;
  completedClientCount: number;
  failures: string[];
  /** Results removed by the automatic path policy. */
  excludedCount?: number;
  /** Bounded paths removed by the automatic path policy. */
  excludedExamples?: string[];
  /** Known coverage limits: the server may not have loaded every project in scope. */
  coverageGap?: string;
  /**
   * Row-limit reasons whose cut answers still hold every exact-name declaration.
   * Unlike `failures`, they leave exact-name selection sound.
   */
  exactNameLimits?: string[];
  /** At least one client's answer was cut at its row limit. */
  rowLimited?: boolean;
}

/**
 * Mark a collection whose warm-up never reached a configured project.
 * The server answered only from inferred projects of the opened probe files,
 * so an empty or short result does not prove a symbol is absent.
 */
export function workspaceSymbolCoverageGap(
  collection: WorkspaceSymbolCollection,
  inferredProbeCount: number,
): WorkspaceSymbolCollection {
  const noun = `file${inferredProbeCount === 1 ? "" : "s"}`;
  return {
    ...collection,
    coverageGap:
      `Workspace-symbol coverage is limited: ${inferredProbeCount} opened warm-up ${noun} ` +
      "loaded only inferred projects, not a configured project. Open a project source file and retry.",
  };
}

/**
 * Collect workspace symbols from every running client that supports them.
 *
 * @param scoped - the caller already limits results to a scope, so the
 *   row-limit advice must not suggest adding one.
 */
export async function collectWorkspaceSymbols(
  clients: Iterable<LspClient>,
  query: string,
  control?: CodeRequestControl,
  scoped = false,
): Promise<WorkspaceSymbolCollection> {
  const results: WorkspaceSymbolLike[] = [];
  const failures: string[] = [];
  const exactNameLimits: string[] = [];
  let rowLimited = false;
  let hasSupport = false;
  let completedClientCount = 0;

  for (const client of clients) {
    if (client.status !== "running" || !client.serverCapabilities?.workspaceSymbolProvider) {
      continue;
    }
    hasSupport = true;
    const result = await client.workspaceSymbol(query, control);
    if (result.kind === "unavailable") {
      failures.push(result.reason);
      continue;
    }
    completedClientCount++;
    const rows = result.data ?? [];
    results.push(...rows);
    if (result.kind === "partial") failures.push(result.reason);
    const limit = nativeTypeScriptRowLimit(client, rows, query, scoped);
    rowLimited ||= limit !== null;
    if (limit?.exactNamesComplete) exactNameLimits.push(limit.reason);
    else if (limit) failures.push(limit.reason);
  }

  return {
    results,
    hasSupport,
    completedClientCount,
    failures,
    ...(exactNameLimits.length > 0 ? { exactNameLimits } : {}),
    ...(rowLimited ? { rowLimited } : {}),
  };
}

/**
 * Join partial-result reasons into one message. A reason that already ends a
 * sentence is followed by a space, so the message never reads `.;`.
 */
export function joinWorkspaceSymbolReasons(
  reasons: readonly (string | null | undefined)[],
): string {
  return reasons
    .filter((reason): reason is string => Boolean(reason))
    .reduce((joined, reason) => {
      if (!joined) return reason;
      return `${joined}${/[.!?]$/.test(joined) ? " " : "; "}${reason}`;
    }, "");
}

function workspaceSymbolExclusionReason(collection: WorkspaceSymbolCollection): string | null {
  const excludedCount = collection.excludedCount ?? 0;
  if (excludedCount === 0) return null;
  const noun = `workspace-symbol result${excludedCount === 1 ? "" : "s"}`;
  // Paths belong to typed metadata so consumers can distinguish observed aliases from navigation.
  return `Automatic path policy excluded ${excludedCount} ${noun}.`;
}

/** Project one multi-client collection into the shared typed query contract. */
export function workspaceSymbolCollectionResult(
  collection: WorkspaceSymbolCollection,
): CodeQueryResult<WorkspaceSymbolLike[]> {
  if (!collection.hasSupport) {
    return unavailableCodeQuery("No active LSP client supports workspace-symbol requests.");
  }
  if (collection.completedClientCount === 0) {
    return unavailableCodeQuery(
      joinWorkspaceSymbolReasons(collection.failures) || "No workspace-symbol request completed.",
    );
  }
  const exclusion = workspaceSymbolExclusionReason(collection);
  const exactNameLimits = collection.exactNameLimits ?? [];
  const reason = joinWorkspaceSymbolReasons([
    ...collection.failures,
    ...exactNameLimits,
    collection.coverageGap,
    exclusion,
  ]);
  if (!reason) return completedCodeQuery(collection.results);
  // Without failures or coverage gaps, the remaining reasons keep in-scope selection sound.
  const sound = collection.failures.length === 0 && !collection.coverageGap;
  const excludedCount = collection.excludedCount ?? 0;
  const metadata: CodeQueryPartialMetadata = {
    ...(excludedCount > 0 && {
      automaticPathExclusion: { excludedCount, examples: [...(collection.excludedExamples ?? [])] },
    }),
    ...(collection.rowLimited && {
      rowLimit: { exactNamesComplete: sound && exactNameLimits.length > 0 },
    }),
    ...(sound && exactNameLimits.length === 0 && { exclusionOnly: true }),
  };
  return partialCodeQuery(
    collection.results,
    reason,
    Object.keys(metadata).length > 0 ? metadata : undefined,
  );
}
