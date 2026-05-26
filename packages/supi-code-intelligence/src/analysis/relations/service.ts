/**
 * Relations service — dispatches code_relations by kind.
 *
 * This is a thin dispatcher that routes to the appropriate
 * callers/implementations/callees module based on the kind.
 * It does NOT perform target resolution — callers must
 * resolve the target first and pass the coordinates.
 */

import { collectCallees } from "./callees.ts";
import { collectCallers } from "./callers.ts";
import { collectImplementations } from "./implementations.ts";
import type { RelationsResult, RelationsServiceDeps, RelationsServiceInput } from "./types.ts";

/**
 * Execute a relations analysis.
 *
 * @param input The relations request with kind, coordinates, and options.
 * @param deps Provider and workspace dependencies.
 * @returns A typed RelationsResult for the renderer.
 */
export async function executeRelationsService(
  input: RelationsServiceInput,
  deps: RelationsServiceDeps,
): Promise<RelationsResult> {
  if (!deps.provider) {
    return {
      kind: "unavailable",
      reason: "No code provider initialized for this workspace.",
    };
  }

  const maxResults = input.maxResults;
  const targetFile = input.file ?? deps.cwd;
  const targetLine = input.line ?? 1;
  const targetChar = input.character ?? 1;

  switch (input.kind) {
    case "callers":
      return collectCallers(
        targetFile,
        { line: targetLine, character: targetChar },
        input.symbol ?? null,
        deps,
        maxResults,
      );

    case "implementations":
      return collectImplementations(
        targetFile,
        { line: targetLine, character: targetChar },
        input.symbol ?? null,
        deps,
        maxResults,
      );

    case "callees":
      return collectCallees(
        targetFile,
        targetLine,
        targetChar,
        input.symbol ?? null,
        deps,
        maxResults,
      );
  }
}
