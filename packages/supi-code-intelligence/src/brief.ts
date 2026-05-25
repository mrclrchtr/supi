// Public facade — delegates to the new use-case and presentation layers.
// Existing callers (api.ts, index.ts, code-intelligence.ts) remain compatible.

import type { ArchitectureModel } from "@mrclrchtr/supi-code-runtime/api";
import { getDependents } from "@mrclrchtr/supi-code-runtime/api";
import { formatGitContext, gatherGitContext } from "./git-context.ts";
import { renderOverview } from "./presentation/markdown/overview.ts";
import type { BriefDetails, ConfidenceMode } from "./types.ts";
import { buildOverviewData } from "./use-case/build-overview.ts";

// Re-export focused brief generation
export { generateFocusedBrief } from "./brief-focused.ts";

// ── Overview (first-turn injection) ───────────────────────────────────

/**
 * Generate a compact architecture overview for first-turn session injection.
 * Targets roughly 500 tokens or less; prefers dense module-edge format.
 *
 * Delegates to use-case/build-overview + presentation/markdown/overview.
 */
export function generateOverview(model: ArchitectureModel): string | null {
  const data = buildOverviewData(model);
  if (!data) return null;
  return renderOverview(data);
}

// ── Full-project brief ────────────────────────────────────────────────

/**
 * Generate a full-project brief from the architecture model.
 */
export function generateProjectBrief(model: ArchitectureModel): {
  content: string;
  details: BriefDetails;
} {
  const lines: string[] = [];
  const confidence: ConfidenceMode = "structural";

  lines.push("# Project Brief");
  lines.push("");

  if (model.name) {
    lines.push(`**${model.name}**${model.description ? ` — ${model.description}` : ""}`);
    lines.push("");
  }

  const gitCtx = gatherGitContext(model.root);
  if (gitCtx) {
    lines.push(formatGitContext(gitCtx));
  }

  if (model.modules.length === 0) {
    lines.push(
      "No structured modules detected. This appears to be a minimal or source-only project.",
    );
    return {
      content: lines.join("\n"),
      details: {
        confidence,
        focusTarget: null,
        startHere: [],
        publicSurfaces: [],
        dependencySummary: null,
        omittedCount: 0,
        nextQueries: [],
      },
    };
  }

  const { startHere, publicSurfaces } = addModuleSections(lines, model);
  addDependencyGraph(lines, model);

  const topStartHere = startHere.sort((a, b) => b.reason.length - a.reason.length).slice(0, 3);
  addStartHereSection(lines, topStartHere);

  const nextQueries = buildNextQueries(model, publicSurfaces);
  addNextSection(lines, nextQueries);

  return {
    content: lines.join("\n"),
    details: {
      confidence,
      focusTarget: null,
      startHere: topStartHere,
      publicSurfaces: publicSurfaces.slice(0, 5),
      dependencySummary: { moduleCount: model.modules.length, edgeCount: model.edges.length },
      omittedCount: 0,
      nextQueries,
    },
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: module section generation with conditional formatting
function addModuleSections(
  lines: string[],
  model: ArchitectureModel,
): { startHere: Array<{ target: string; reason: string }>; publicSurfaces: string[] } {
  lines.push("## Modules");
  lines.push("");

  const startHere: Array<{ target: string; reason: string }> = [];
  const publicSurfaces: string[] = [];

  for (const mod of model.modules) {
    const shortName = mod.name.replace(/^@[^/]+\//, "");
    const deps = mod.internalDeps.map((d) => d.replace(/^@[^/]+\//, "")).join(", ");
    const dependents = getDependents(model, mod.name);
    const depCount = dependents.length;

    lines.push(`### ${shortName}`);
    if (mod.description) lines.push(`${mod.description}`);
    lines.push(`- Path: \`${mod.relativePath}\``);
    if (mod.entrypoints.length > 0) {
      lines.push(`- Entrypoints: ${mod.entrypoints.map((e) => `\`${e}\``).join(", ")}`);
      publicSurfaces.push(`${shortName}: ${mod.entrypoints[0]}`);
    }
    if (deps) lines.push(`- Dependencies: ${deps}`);
    if (depCount > 0) lines.push(`- Dependents: ${depCount} module${depCount > 1 ? "s" : ""}`);
    if (mod.isLeaf) lines.push("- _(leaf — no internal dependents)_");
    lines.push("");

    if (depCount >= 2) {
      startHere.push({
        target: `${shortName} (${mod.relativePath})`,
        reason: `core dependency used by ${depCount} modules`,
      });
    }
  }

  return { startHere, publicSurfaces };
}

function addDependencyGraph(lines: string[], model: ArchitectureModel): void {
  if (model.edges.length === 0) return;
  lines.push("## Dependency Graph");
  lines.push("");
  for (const edge of model.edges.slice(0, 15)) {
    const from = edge.from.replace(/^@[^/]+\//, "");
    const to = edge.to.replace(/^@[^/]+\//, "");
    lines.push(`- ${from} → ${to}`);
  }
  if (model.edges.length > 15) {
    lines.push(`- _+${model.edges.length - 15} more edges omitted_`);
  }
  lines.push("");
}

function addStartHereSection(
  lines: string[],
  topStartHere: Array<{ target: string; reason: string }>,
): void {
  if (topStartHere.length === 0) return;
  lines.push("## Start Here");
  lines.push("");
  for (const item of topStartHere) {
    lines.push(`- **${item.target}** — ${item.reason}`);
  }
  lines.push("");
}

function buildNextQueries(model: ArchitectureModel, publicSurfaces: string[]): string[] {
  const nextQueries: string[] = [];
  if (model.modules.length > 0) {
    const firstMod = model.modules[0];
    nextQueries.push(
      `\`code_brief\` with \`path: "${firstMod.relativePath}"\` for a focused module brief`,
    );
  }
  if (publicSurfaces.length > 0) {
    nextQueries.push("`code_affected` before modifying shared exports");
  }
  return nextQueries;
}

function addNextSection(lines: string[], nextQueries: string[]): void {
  if (nextQueries.length === 0) return;
  lines.push("## Next");
  lines.push("");
  for (const q of nextQueries.slice(0, 2)) {
    lines.push(`- ${q}`);
  }
  lines.push("");
}
