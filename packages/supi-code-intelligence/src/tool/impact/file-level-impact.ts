// File-level target-group impact execution.
// Extracted from orchestrate.ts.

import { buildArchitectureModel } from "../../analysis/architecture/discovery.ts";
import type { CodeProvider } from "../../analysis/provider.ts";
import { aggregatePerTarget, collectReferences } from "../../analysis/references/semantic-refs.ts";
import { summarizePrioritySignalsForFiles } from "../../analysis/signals/project.ts";
import type { ResolvedTargetGroupData } from "../../analysis/target/types.ts";
import { buildTestAnchorMap } from "../../analysis/tests/likely-tests.ts";
import type { CodeIntelResult } from "../../types/index.ts";
import { analyzeReferenceImpact, buildDetailsData, computeOmittedCount } from "./analysis.ts";
import { renderImpactFileLevel } from "./markdown.ts";
import type { ImpactInput } from "./types.ts";

// biome-ignore lint/complexity/useMaxParams: shared impact orchestration keeps related substrate inputs explicit
export async function executeFileLevelImpact(
  targetGroup: ResolvedTargetGroupData,
  input: ImpactInput,
  cwd: string,
  semantic: CodeProvider,
  lspService: import("@mrclrchtr/supi-lsp/api").SessionLspServiceState,
): Promise<CodeIntelResult> {
  const perTarget = await Promise.all(
    targetGroup.targets.map(async (t) => ({
      target: t,
      refs: await collectReferences(t, cwd, semantic),
    })),
  );

  const aggregated = await aggregatePerTarget(targetGroup.targets, (t) =>
    collectReferences(t, cwd, semantic),
  );

  const model = await buildArchitectureModel(cwd);
  const analysis = await analyzeReferenceImpact(
    aggregated,
    model,
    cwd,
    input.includeTests === true,
    semantic.references,
    targetGroup.targets.map((t) => t.file), // seed all target files
    buildTestAnchorMap(targetGroup.targets.map((t) => ({ file: t.file, position: t.position }))),
    semantic.outline,
  );

  const prioritySignals = summarizePrioritySignalsForFiles(
    cwd,
    analysis.affectedFiles.size > 0 ? [...analysis.affectedFiles] : [targetGroup.file],
    lspService,
  );

  const maxResults = input.maxResults ?? 8;
  const content = renderImpactFileLevel({
    targetGroup,
    perTarget,
    aggregated,
    analysis,
    maxResults,
    prioritySignals,
    cwd,
  });

  const detailsData = buildDetailsData(
    analysis,
    aggregated.refs.length,
    computeOmittedCount(analysis.externalRefs, analysis.affectedFiles.size, input.maxResults),
    [
      "`code_orientation` on the most-affected module for deeper orientation",
      "Use `code_inspect` with file + line + character to inspect one exported target precisely",
    ],
    prioritySignals,
  );

  return {
    content,
    details: {
      type: "impact",
      data: detailsData,
    },
  };
}
