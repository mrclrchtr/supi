// Change-set impact execution.
// Extracted from orchestrate.ts.

import { buildArchitectureModel } from "../../analysis/architecture/discovery.ts";
import type { CodeProvider } from "../../analysis/provider.ts";
import { aggregatePerTarget, collectReferences } from "../../analysis/references/semantic-refs.ts";
import { summarizePrioritySignalsForFiles } from "../../analysis/signals/project.ts";
import { resolveFileTargetGroup } from "../../analysis/target/file.ts";
import type { ResolvedTargetData } from "../../analysis/target/types.ts";
import type { ChangeSetFileEntry } from "../../analysis/tests/likely-tests.ts";
import { normalizeChangeSet } from "../../analysis/tests/likely-tests.ts";
import type { CodeIntelResult } from "../../types/index.ts";
import { analyzeChangeSet, buildDetailsData, type ChangeSetSemanticImpact } from "./analysis.ts";
import { renderChangeSetImpact } from "./markdown.ts";
import { unavailableImpactResult } from "./result.ts";
import type { ImpactAnalysis, ImpactInput } from "./types.ts";

export async function executeChangeSetImpact(
  input: ImpactInput,
  cwd: string,
  provider: CodeProvider | null,
  lspService: import("@mrclrchtr/supi-lsp/api").SessionLspServiceState,
): Promise<CodeIntelResult> {
  const changeSetFiles = normalizeChangeSet(input.changeSetFiles ?? [], cwd);
  if (changeSetFiles.length === 0) {
    return unavailableImpactResult(
      "**Unavailable:** No readable change-set files were provided for impact analysis.",
      [
        "Provide `changeSetFiles` with workspace-relative file paths",
        "Use `code_resolve` when you want symbol-level impact instead",
      ],
    );
  }

  const model = await buildArchitectureModel(cwd);
  const semanticImpact = await collectChangeSetSemanticImpact(changeSetFiles, cwd, provider);
  const analysis = await analyzeChangeSet({
    changeSetFiles,
    model,
    cwd,
    includeTests: input.includeTests === true,
    semanticImpact,
  });
  const prioritySignals = summarizePrioritySignalsForFiles(
    cwd,
    changeSetFiles.map((entry) => entry.absPath),
    lspService,
  );
  const nextQueries = buildChangeSetNextQueries(changeSetFiles, analysis, semanticImpact);
  const upgradeSuggestion = buildSemanticUpgradeSuggestion(changeSetFiles, semanticImpact);
  const evidenceNote =
    analysis.confidence === "semantic"
      ? "\n**Evidence: semantic+structural** — semantic references for symbols defined in change-set files were merged with file-level module analysis and bounded test discovery.\n"
      : `\n**Evidence: structural** — impact limited to file-level module analysis and path-based test discovery.\n${upgradeSuggestion}\n`;
  const content =
    renderChangeSetImpact({
      changeSetFiles: changeSetFiles.map((entry) => entry.relPath),
      analysis,
      prioritySignals,
    }) + evidenceNote;

  const detailsData = buildDetailsData(
    analysis,
    changeSetFiles.length,
    0,
    nextQueries,
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

async function collectChangeSetSemanticImpact(
  changeSetFiles: ChangeSetFileEntry[],
  cwd: string,
  provider: CodeProvider | null,
): Promise<ChangeSetSemanticImpact | null> {
  if (!provider?.references) return null;

  const targets: ResolvedTargetData[] = [];
  for (const entry of changeSetFiles) {
    try {
      const outcome = await resolveFileTargetGroup(entry.relPath, cwd, {
        semantic: provider,
        structural: provider,
      });
      if (outcome.kind === "resolved") {
        targets.push(...outcome.group.targets);
      }
    } catch {
      // Keep change-set analysis best-effort: structural impact still applies.
    }
  }

  const cappedTargets = targets.slice(0, 25);
  if (cappedTargets.length === 0) return null;

  const refs = await aggregatePerTarget(cappedTargets, (target) =>
    collectReferences(target, cwd, provider),
  );
  if (refs.confidence !== "semantic" || (refs.refs.length === 0 && refs.externalCount === 0)) {
    return null;
  }

  return {
    targets: cappedTargets,
    refs,
    references: provider.references,
    outline: provider.outline,
  };
}

function buildChangeSetNextQueries(
  changeSetFiles: ChangeSetFileEntry[],
  analysis: ImpactAnalysis,
  semanticImpact: ChangeSetSemanticImpact | null,
): string[] {
  const firstFile = changeSetFiles[0]?.relPath;
  const next: string[] = [];
  if (firstFile) {
    next.push(
      `\`code_orientation\` with \`focus: "${firstFile}"\` for focused orientation on the change-set file`,
    );
  }
  if (analysis.checkNext.length > 0) {
    next.push("`code_orientation` on the most-affected module for broader orientation");
  }
  if (analysis.confidence !== "semantic" && firstFile) {
    const symbolHint = semanticImpact?.targets[0]?.name ?? "<primary exported symbol>";
    next.push(
      `For semantic impact, run \`code_resolve(query="${symbolHint}", scope="${firstFile}")\` then \`code_impact(targetId="<result>", change="<your change>")\``,
    );
  }
  return next;
}

function buildSemanticUpgradeSuggestion(
  changeSetFiles: ChangeSetFileEntry[],
  semanticImpact: ChangeSetSemanticImpact | null,
): string {
  const firstFile = changeSetFiles[0]?.relPath;
  if (!firstFile) return "";
  const symbolHint = semanticImpact?.targets[0]?.name ?? "<primary exported symbol>";
  return `For semantic impact, run \`code_resolve(query="${symbolHint}", scope="${firstFile}")\` then \`code_impact(targetId="<result>", change="<your change>")\`.`;
}
