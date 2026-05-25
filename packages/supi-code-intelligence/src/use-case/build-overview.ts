// Typed overview data builder from ArchitectureModel.

import { formatGitContext, gatherGitContext } from "../git-context.ts";
import type { ArchitectureModel } from "../model.ts";
import type { OverviewData, OverviewModule } from "./types.ts";

/**
 * Build structured overview data from an architecture model.
 * No markdown rendering — callers pass the result to a presentation renderer.
 */
export function buildOverviewData(model: ArchitectureModel): OverviewData | null {
  if (model.modules.length === 0) return null;

  const dependedOn = new Set(model.edges.map((e) => e.to));

  const modules: OverviewModule[] = model.modules.slice(0, 8).map((mod) => ({
    name: mod.name,
    shortName: mod.name.replace(/^@[^/]+\//, ""),
    description: mod.description,
    isLeaf: !dependedOn.has(mod.name),
    internalDeps: mod.internalDeps,
  }));

  const omittedModuleCount = Math.max(0, model.modules.length - 8);

  const gitCtx = gatherGitContext(model.root);
  const gitContextOverview = gitCtx ? formatGitContext(gitCtx) : null;

  return {
    projectName: model.name,
    projectDescription: model.description,
    modules,
    omittedModuleCount,
    gitContextOverview,
  };
}
