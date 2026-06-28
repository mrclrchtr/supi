/**
 * code_resolve orchestration — result assembly and details construction.
 *
 * Receives raw resolution outcomes from the resolution service and
 * assembles the markdown content and structured details.
 */

import { relative } from "node:path";
import { executeResolveService, type ResolveServiceParams } from "../../analysis/target/service.ts";
import type { WorkspaceCodeIntelligenceSession } from "../../session/session.ts";
import type { CodeIntelResult, ResolveDetails } from "../../types/index.ts";
import { unavailableResolveDetails } from "../infra/error-results.ts";
import { renderResolveResult } from "./markdown.ts";

export interface ResolveOrchestrateInput {
  params: ResolveServiceParams;
  session: WorkspaceCodeIntelligenceSession;
  cwd: string;
}

export async function orchestrateResolve(input: ResolveOrchestrateInput): Promise<CodeIntelResult> {
  const { params, session, cwd } = input;
  const result = await executeResolveService(params, session);

  let content = renderResolveResult(result, cwd);

  // For single-target resolutions, append actionable "Chain next" guidance.
  if (result.kind === "resolved" && result.targets.length === 1) {
    const target = result.targets[0];
    const rels = suggestedRelations(target.kind);
    if (rels) {
      const chainLine = `Chain next: \`code_graph(targetId: "${target.targetId}", relations: ${JSON.stringify(rels)})\``;
      content = `${content}\n${chainLine}\n`;
    }
  }

  // Build structured details
  if (result.kind === "resolved") {
    const details: ResolveDetails = {
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
    return { content, details: { type: "resolve", data: details } };
  }

  if (result.kind === "disambiguation") {
    const details: ResolveDetails = {
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
    return { content, details: { type: "resolve", data: details } };
  }

  // Error — still return structured details
  return {
    content,
    details: unavailableResolveDetails([
      "Refine the `query` or `scope`",
      "Use anchored `file` + `line` + `character` for a precise target",
    ]),
  };
}

/**
 * Suggested `code_graph` relations for a resolved symbol kind.
 */
function suggestedRelations(kind: string | undefined | null): string[] | undefined {
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
