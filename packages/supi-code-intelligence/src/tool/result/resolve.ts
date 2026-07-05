import { relative } from "node:path";
import type { ResolveServiceResult } from "../../analysis/target/service.ts";
import type { ResolveDetails } from "./types.ts";

export interface ResolveResultAssembly {
  result: ResolveServiceResult;
  cwd: string;
  details: ResolveDetails;
}

/** Assemble code_resolve evidence/details before markdown and TUI adapters render it. */
export function assembleResolveResult(
  result: ResolveServiceResult,
  cwd: string,
): ResolveResultAssembly {
  return { result, cwd, details: buildResolveDetails(result, cwd) };
}

function buildResolveDetails(result: ResolveServiceResult, cwd: string): ResolveDetails {
  if (result.kind === "resolved") {
    return {
      confidence: result.confidence,
      targetCount: result.targets.length + result.omittedCount,
      omittedCount: result.omittedCount,
      evidenceLists: [
        {
          key: "resolve.targets",
          totalCount: result.targets.length + result.omittedCount,
          shownCount: result.targets.length,
          omittedCount: result.omittedCount,
          partialReason: null,
        },
      ],
      targets: result.targets.map((t) => ({
        targetId: t.targetId,
        spanId: t.spanId,
        file: relative(cwd, t.file) || t.file,
        displayLine: t.displayLine,
        displayCharacter: t.displayCharacter,
        name: t.name,
        kind: t.kind,
        anchorKind: t.anchorKind,
        confidence: t.confidence,
        provenance: t.provenance,
        resolution: t.resolution,
      })),
      nextQueries: result.nextQueries,
    };
  }

  if (result.kind === "disambiguation") {
    return {
      confidence: "semantic",
      targetCount: result.candidates.length + result.omittedCount,
      omittedCount: result.omittedCount,
      evidenceLists: [
        {
          key: "resolve.candidates",
          totalCount: result.candidates.length + result.omittedCount,
          shownCount: result.candidates.length,
          omittedCount: result.omittedCount,
          partialReason: null,
        },
      ],
      targets: [],
      candidates: result.candidates.map((cand) => ({
        targetId: cand.targetId,
        name: cand.name,
        kind: cand.kind,
        container: cand.container,
        file: cand.file,
        line: cand.line,
        character: cand.character,
        reason: cand.reason,
        rank: cand.rank,
        anchorKind: cand.anchorKind,
      })),
      nextQueries: result.nextQueries,
    };
  }

  return {
    confidence: "unavailable",
    targetCount: 0,
    omittedCount: 0,
    targets: [],
    nextQueries: [
      "Refine the `query` or `scope`",
      "Use anchored `file` + `line` + `character` for a precise target",
    ],
  };
}

/** Suggested `code_graph` relations for a resolved symbol kind. */
export function suggestedResolveRelations(kind: string | undefined | null): string[] | undefined {
  switch (kind?.toLowerCase()) {
    case "function":
    case "method":
    case "constructor":
      return ["references", "callees", "tests"];
    case "class":
    case "interface":
    case "type":
    case "enum":
      return ["references", "implements"];
    case "file":
    case "module":
      return ["imports", "exports"];
    case "test":
      return ["tests"];
    default:
      return undefined;
  }
}
