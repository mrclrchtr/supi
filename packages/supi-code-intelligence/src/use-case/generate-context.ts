// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: context orchestration is kept together to share local section helpers
import * as path from "node:path";
import { collectOutgoingCalls } from "../analysis/calls/service.ts";
import { collectReferences } from "../analysis/references/service.ts";
import {
  type RenderedContextSection,
  renderContextResult,
} from "../presentation/markdown/context.ts";
import type { ConfidenceMode, ContextDetails } from "../types.ts";
import { gatherTreeSitterContext } from "./gather-context.ts";
import { executeBrief } from "./generate-brief.ts";
import type {
  BriefInput,
  ContextDeps,
  ContextInput,
  ContextSection,
  ContextTarget,
  ContextUseCaseResult,
} from "./types.ts";

const DEFAULT_CONTEXT_SECTIONS: ContextSection[] = ["defs", "references", "callees"];

const SECTION_TITLES: Record<ContextSection, string> = {
  defs: "Definitions",
  references: "References",
  callees: "Callees",
  tests: "Tests",
  docs: "Docs",
  diagnostics: "Diagnostics",
  exports: "Exports",
  imports: "Imports",
};

/**
 * Build a code_context result.
 *
 * When `task` is omitted, this falls back to the existing orientation-style brief flow.
 * When `task` is present, it assembles an explicit task bundle from the currently
 * available semantic/structural evidence.
 */
export async function executeContext(
  input: ContextInput,
  deps: ContextDeps,
): Promise<ContextUseCaseResult> {
  if (!input.task) {
    return executeOrientationContext(input, deps);
  }

  return executeTaskContext(input, deps);
}

async function executeOrientationContext(
  input: ContextInput,
  deps: ContextDeps,
): Promise<ContextUseCaseResult> {
  const briefInput = toBriefInput(input);
  const result = await executeBrief(briefInput, {
    model: deps.model,
    provider: deps.provider,
    cwd: deps.cwd,
  });

  const details: ContextDetails = {
    confidence: result.details.confidence,
    task: null,
    focusTarget: input.target ? formatFocusTarget(input.target, deps.cwd) : null,
    requestedSections: [],
    renderedSections: ["orientation"],
    omittedCount: result.details.omittedCount,
    nextQueries: result.details.nextQueries,
  };

  return {
    content: result.content,
    details,
  };
}

async function executeTaskContext(
  input: ContextInput,
  deps: ContextDeps,
): Promise<ContextUseCaseResult> {
  const requestedSections = input.include ?? DEFAULT_CONTEXT_SECTIONS;
  const limit = resolveResultLimit(input.budget, input.maxResults);
  const focusTarget = input.target
    ? formatFocusTarget(input.target, deps.cwd)
    : (input.scope ?? null);
  const nextQueries = buildNextQueries(input.target, deps.cwd);
  const sections: RenderedContextSection[] = [];

  let omittedCount = 0;
  let hasStructural = false;
  let hasSemantic = false;

  const treeContext = await maybeGatherTreeContext(input.target, deps, requestedSections);

  for (const section of requestedSections) {
    const built = await buildRequestedSection({
      section,
      input,
      deps,
      limit,
      treeContext,
    });
    sections.push(built.section);
    omittedCount += built.omittedCount;
    hasStructural = hasStructural || built.hasStructuralEvidence;
    hasSemantic = hasSemantic || built.hasSemanticEvidence;
  }

  const confidence: ConfidenceMode = hasSemantic
    ? "semantic"
    : hasStructural
      ? "structural"
      : "unavailable";

  const details: ContextDetails = {
    confidence,
    task: input.task ?? null,
    focusTarget,
    requestedSections,
    renderedSections: sections.map((section) => section.key),
    omittedCount,
    nextQueries,
  };

  return {
    content: renderContextResult({
      task: input.task ?? "",
      focusTarget,
      sections,
      nextQueries,
    }),
    details,
  };
}

async function buildRequestedSection(options: {
  section: ContextSection;
  input: ContextInput;
  deps: ContextDeps;
  limit: number;
  treeContext: Awaited<ReturnType<typeof maybeGatherTreeContext>>;
}): Promise<{
  section: RenderedContextSection;
  omittedCount: number;
  hasStructuralEvidence: boolean;
  hasSemanticEvidence: boolean;
}> {
  const { section, input, deps, limit, treeContext } = options;

  switch (section) {
    case "defs": {
      const lines = buildDefinitionLines(input.target, deps.cwd, treeContext);
      return {
        section: { key: section, title: SECTION_TITLES[section], lines },
        omittedCount: 0,
        hasStructuralEvidence: hasRenderableItems(lines),
        hasSemanticEvidence: false,
      };
    }
    case "imports": {
      const lines = buildImportLines(treeContext, limit);
      return {
        section: { key: section, title: SECTION_TITLES[section], lines },
        omittedCount: 0,
        hasStructuralEvidence: hasRenderableItems(lines),
        hasSemanticEvidence: false,
      };
    }
    case "exports": {
      const lines = buildExportLines(treeContext, limit);
      return {
        section: { key: section, title: SECTION_TITLES[section], lines },
        omittedCount: 0,
        hasStructuralEvidence: hasRenderableItems(lines),
        hasSemanticEvidence: false,
      };
    }
    case "references": {
      const result = await buildReferenceSection(input.target, deps, limit);
      return {
        section: { key: section, title: SECTION_TITLES[section], lines: result.lines },
        omittedCount: result.omittedCount,
        hasStructuralEvidence: false,
        hasSemanticEvidence: result.hasSemanticEvidence,
      };
    }
    case "callees": {
      const result = await buildCalleesSection(input.target, deps, limit);
      return {
        section: { key: section, title: SECTION_TITLES[section], lines: result.lines },
        omittedCount: result.omittedCount,
        hasStructuralEvidence: result.hasStructuralEvidence,
        hasSemanticEvidence: false,
      };
    }
    case "docs": {
      return buildStaticSection(section, ["No docs context found."]);
    }
    case "tests": {
      return buildStaticSection(section, ["No test context found."]);
    }
    case "diagnostics": {
      return buildStaticSection(section, ["No diagnostics found."]);
    }
  }
}

function buildStaticSection(
  section: ContextSection,
  lines: string[],
): {
  section: RenderedContextSection;
  omittedCount: number;
  hasStructuralEvidence: boolean;
  hasSemanticEvidence: boolean;
} {
  return {
    section: { key: section, title: SECTION_TITLES[section], lines },
    omittedCount: 0,
    hasStructuralEvidence: false,
    hasSemanticEvidence: false,
  };
}

function toBriefInput(input: ContextInput): BriefInput {
  if (input.target) {
    return {
      kind: "anchored",
      file: input.target.file,
      line: input.target.line,
      character: input.target.character,
      maxResults: input.maxResults,
    };
  }

  if (input.scope) {
    return { kind: "path", path: input.scope, maxResults: input.maxResults };
  }

  return { kind: "project", maxResults: input.maxResults };
}

function resolveResultLimit(
  budget: ContextInput["budget"],
  maxResults: number | undefined,
): number {
  if (maxResults != null) {
    return maxResults;
  }

  switch (budget) {
    case "small":
      return 1;
    case "large":
      return 5;
    default:
      return 3;
  }
}

async function maybeGatherTreeContext(
  target: ContextTarget | null | undefined,
  deps: ContextDeps,
  requestedSections: ContextSection[],
) {
  if (!target) return null;
  if (!requestedSections.some((section) => ["defs", "imports", "exports"].includes(section))) {
    return null;
  }

  const relPath = path.relative(deps.cwd, target.file);
  return gatherTreeSitterContext(deps.provider, relPath, target.line, target.character);
}

function buildDefinitionLines(
  target: ContextTarget | null | undefined,
  cwd: string,
  treeContext: Awaited<ReturnType<typeof maybeGatherTreeContext>>,
): string[] {
  if (!target) {
    return ["No precise target context found."];
  }

  const lines = [`- Focus: \`${formatFocusTarget(target, cwd)}\``];
  if (target.name) {
    lines.push(`- Symbol: \`${target.name}\`${target.kind ? ` (${target.kind})` : ""}`);
  }
  if (treeContext?.nodeInfo?.type) {
    lines.push(`- Node: \`${treeContext.nodeInfo.type}\``);
  }
  if (treeContext?.hover?.contents) {
    const firstLine =
      treeContext.hover.contents.trim().split("\n")[0] ?? treeContext.hover.contents;
    if (firstLine.length > 0) {
      lines.push(`- Hover: ${firstLine}`);
    }
  }
  return lines;
}

function buildImportLines(
  treeContext: Awaited<ReturnType<typeof maybeGatherTreeContext>>,
  limit: number,
): string[] {
  if (!treeContext) {
    return ["Imports unavailable for the current focus."];
  }
  if (treeContext.imports.length === 0) {
    return ["No imports context found."];
  }
  return treeContext.imports.slice(0, limit).map((entry) => `- \`${entry.moduleSpecifier}\``);
}

function buildExportLines(
  treeContext: Awaited<ReturnType<typeof maybeGatherTreeContext>>,
  limit: number,
): string[] {
  if (!treeContext) {
    return ["Exports unavailable for the current focus."];
  }
  if (treeContext.exports.length === 0) {
    return ["No exports context found."];
  }
  return treeContext.exports
    .slice(0, limit)
    .map((entry) => `- \`${entry.name}\`${entry.kind ? ` (${entry.kind})` : ""}`);
}

async function buildReferenceSection(
  target: ContextTarget | null | undefined,
  deps: ContextDeps,
  limit: number,
): Promise<{ lines: string[]; omittedCount: number; hasSemanticEvidence: boolean }> {
  if (!target) {
    return {
      lines: ["References unavailable without a precise target."],
      omittedCount: 0,
      hasSemanticEvidence: false,
    };
  }

  if (!deps.provider?.references) {
    return {
      lines: ["References unavailable for the current workspace."],
      omittedCount: 0,
      hasSemanticEvidence: false,
    };
  }

  const refs = await collectReferences(
    target.file,
    { line: target.line - 1, character: target.character - 1 },
    target.name,
    { cwd: deps.cwd, provider: { references: deps.provider.references } },
    limit,
  );

  if (refs.references.length === 0) {
    return {
      lines: ["No references found."],
      omittedCount: 0,
      hasSemanticEvidence: refs.confidence === "semantic",
    };
  }

  return {
    lines: refs.references.map((ref) => {
      const relFile = path.relative(deps.cwd, ref.file);
      return `- \`${relFile}:${ref.line}\``;
    }),
    omittedCount: 0,
    hasSemanticEvidence: refs.confidence === "semantic",
  };
}

async function buildCalleesSection(
  target: ContextTarget | null | undefined,
  deps: ContextDeps,
  limit: number,
): Promise<{ lines: string[]; omittedCount: number; hasStructuralEvidence: boolean }> {
  if (!target) {
    return {
      lines: ["Callees unavailable without a precise target."],
      omittedCount: 0,
      hasStructuralEvidence: false,
    };
  }

  if (!deps.provider?.calleesAt) {
    return {
      lines: ["Callees unavailable for the current workspace."],
      omittedCount: 0,
      hasStructuralEvidence: false,
    };
  }

  const calls = await collectOutgoingCalls(
    target.file,
    target.line,
    target.character,
    target.name,
    { cwd: deps.cwd, provider: { calleesAt: deps.provider.calleesAt } },
    limit,
  );

  if (calls.calls.length === 0) {
    return {
      lines: ["No callees found."],
      omittedCount: 0,
      hasStructuralEvidence: calls.confidence === "structural",
    };
  }

  return {
    lines: calls.calls.map((entry) => `- \`${entry.name}\``),
    omittedCount: 0,
    hasStructuralEvidence: calls.confidence === "structural",
  };
}

function formatFocusTarget(target: ContextTarget, cwd: string): string {
  const relPath = path.relative(cwd, target.file) || target.file;
  return `${relPath}:${target.line}:${target.character}`;
}

function buildNextQueries(target: ContextTarget | null | undefined, cwd: string): string[] {
  if (!target) {
    return ["Use `code_brief` for a neutral orientation summary."];
  }

  const relPath = path.relative(cwd, target.file) || target.file;
  return [
    `\`code_graph\` with \`file: "${relPath}"\`, \`line: ${target.line}\`, and \`character: ${target.character}\` for deeper relation follow-up`,
    `\`code_affected\` with \`file: "${relPath}"\`, \`line: ${target.line}\`, and \`character: ${target.character}\` for blast-radius analysis`,
  ];
}

function hasRenderableItems(lines: string[]): boolean {
  return lines.some((line) => line.trim().startsWith("- "));
}
