/**
 * code_resolve orchestration — resolve facts, assemble tool evidence, render adapters.
 */

import { executeResolveService, type ResolveServiceParams } from "../../analysis/target/service.ts";
import type { WorkspaceCodeIntelligenceSession } from "../../session/session.ts";
import type { CodeIntelResult } from "../../types/index.ts";
import { assembleResolveResult, suggestedResolveRelations } from "../result/resolve.ts";
import { renderResolveResult } from "./markdown.ts";

export interface ResolveOrchestrateInput {
  params: ResolveServiceParams;
  session: WorkspaceCodeIntelligenceSession;
  cwd: string;
}

export async function orchestrateResolve(input: ResolveOrchestrateInput): Promise<CodeIntelResult> {
  const { params, session, cwd } = input;
  const result = await executeResolveService(params, session);
  const assembly = assembleResolveResult(result, cwd);

  let content = renderResolveResult(assembly);

  // For single-target resolutions, append actionable "Chain next" guidance.
  if (result.kind === "resolved" && result.targets.length === 1) {
    const target = result.targets[0];
    const rels = suggestedResolveRelations(target.kind);
    if (rels) {
      const chainLine = `Chain next: \`code_graph(targetId: "${target.targetId}", relations: ${JSON.stringify(rels)})\``;
      content = `${content}\n${chainLine}\n`;
    }
  }

  return {
    content,
    details: { type: "resolve", data: assembly.details },
  };
}
