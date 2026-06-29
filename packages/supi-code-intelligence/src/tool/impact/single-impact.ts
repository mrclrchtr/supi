// Single-target impact execution.
// Extracted from orchestrate.ts.

import * as path from "node:path";
import { buildArchitectureModel } from "../../analysis/architecture/discovery.ts";
import { createEvidenceList } from "../../analysis/evidence.ts";
import type { CodeProvider } from "../../analysis/provider.ts";
import { collectReferences } from "../../analysis/references/semantic-refs.ts";
import { summarizePrioritySignalsForFiles } from "../../analysis/signals/project.ts";
import type { ResolvedTargetData } from "../../analysis/target/types.ts";
import { buildTestAnchorMap } from "../../analysis/tests/likely-tests.ts";
import type { CodeIntelResult } from "../../types/index.ts";
import { analyzeReferenceImpact, buildDetailsData, computeOmittedCount } from "./analysis.ts";
import { renderImpactSingle } from "./markdown.ts";
import type { ImpactInput } from "./types.ts";

// biome-ignore lint/complexity/useMaxParams: shared impact orchestration keeps substrate inputs explicit
export async function executeSingleImpact(
  target: ResolvedTargetData,
  symbolName: string,
  input: ImpactInput,
  cwd: string,
  semantic: CodeProvider,
  lspService: import("@mrclrchtr/supi-lsp/api").SessionLspServiceState,
): Promise<CodeIntelResult> {
  const refs = await collectReferences(target, cwd, semantic);
  const model = await buildArchitectureModel(cwd);
  const analysis = await analyzeReferenceImpact(
    refs,
    model,
    cwd,
    input.includeTests === true,
    semantic.references,
    [target.file], // seed the target file itself as affected
    buildTestAnchorMap([{ file: target.file, position: target.position }]),
    semantic.outline,
  );

  const prioritySignals = summarizePrioritySignalsForFiles(
    cwd,
    analysis.affectedFiles.size > 0 ? [...analysis.affectedFiles] : [target.file],
    lspService,
  );

  const maxResults = input.maxResults ?? 8;
  const content = renderImpactSingle({
    symbolName,
    refs,
    analysis,
    maxResults,
    prioritySignals,
    target,
    cwd,
  });

  const referenceEvidence = createEvidenceList({
    key: "references.locations",
    items: refs.refs,
    maxResults,
  }).metadata;
  const detailsData = buildDetailsData(
    analysis,
    refs.refs.length,
    computeOmittedCount(analysis.externalRefs, analysis.affectedFiles.size, input.maxResults),
    buildTargetNextQueries(target, symbolName, cwd),
    prioritySignals,
    [referenceEvidence],
  );

  return {
    content,
    details: {
      type: "impact",
      data: detailsData,
    },
  };
}

function buildTargetNextQueries(
  target: ResolvedTargetData,
  symbolName: string,
  cwd: string,
): string[] {
  const relPath = path.relative(cwd, target.file);
  return [
    `\`code_inspect\` with \`file: "${relPath}"\`, \`line: ${target.displayLine}\`, and \`character: ${target.displayCharacter}\` for point facts around ${symbolName}`,
    `\`code_graph\`, \`file: "${relPath}"\`, \`line: ${target.displayLine}\`, and \`character: ${target.displayCharacter}\` for reference sites`,
  ];
}
