// biome-ignore-all lint/style/noExcessiveLinesPerFile: context orchestration is kept together to share local section helpers
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";

import { collectOutgoingCalls } from "../analysis/calls/service.ts";
import { collectReferences } from "../analysis/references/service.ts";
import { discoverTestFilesForSource } from "../analysis/relations/tests.ts";
import {
  type RenderedContextSection,
  renderContextResult,
} from "../presentation/markdown/context.ts";
import { toDisplayPath } from "../search-helpers.ts";
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
 * Three modes:
 * 1. **Section mode** — `include` without `task`: renders only the requested sections.
 * 2. **Orientation mode** — no `task`/`target`: returns a module/directory/file overview.
 * 3. **Task mode** — `task` + `target`: assembles an explicit task-focused context bundle.
 */
export async function executeContext(
  input: ContextInput,
  deps: ContextDeps,
): Promise<ContextUseCaseResult> {
  // Section mode: honor include without task
  if (input.include && input.include.length > 0 && !input.task) {
    if (!input.target) {
      // No target available — fall back to orientation mode
      // which handles scopes (directory/file) well.
      const result = await executeOrientationContext(input, deps);
      result.content = `_Note: requested sections require a precise target. Returning orientation overview for the scope._\n\n${result.content}`;
      return result;
    }
    return executeSectionMode(input, deps);
  }

  // Orientation mode: full brief fallback
  if (!input.task || !input.target) {
    const result = await executeOrientationContext(input, deps);
    if (input.task && !input.target) {
      result.content = `_Note: task-focused sections require a precise target. Falling back to orientation overview._\n\n${result.content}`;
    }
    return result;
  }

  // Task mode: explicit bundle
  return executeTaskContext(input, deps);
}

async function executeOrientationContext(
  input: ContextInput,
  deps: ContextDeps,
): Promise<ContextUseCaseResult> {
  const briefInput = toBriefInput(input, deps);
  const result = await executeBrief(briefInput, {
    model: deps.model,
    provider: deps.provider,
    cwd: deps.cwd,
    showGitContext: input.showGitContext ?? true,
    lspService: deps.lspService,
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

/**
 * Execute section mode — honor `include` without `task`.
 *
 * Builds a compact header and renders only the requested sections.
 * Sections that need a precise target return honest "unavailable" messages.
 */
async function executeSectionMode(
  input: ContextInput,
  deps: ContextDeps,
): Promise<ContextUseCaseResult> {
  const requestedSections = input.include ?? [];
  const limit = resolveResultLimit(input.budget, input.maxResults);
  const focusTarget = input.scope ?? null;
  const sections: RenderedContextSection[] = [];

  let omittedCount = 0;
  let hasStructural = false;
  let hasSemantic = false;

  for (const section of requestedSections) {
    const built = await buildRequestedSection({
      section,
      input,
      deps,
      limit,
      treeContext: null,
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
    task: null,
    focusTarget,
    requestedSections,
    renderedSections: sections.map((s) => s.key),
    omittedCount,
    nextQueries: [],
  };

  return {
    content: renderContextResult({
      task: "Section mode",
      focusTarget,
      sections,
    }),
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
      const result = await buildDocsSection(input.target, deps, limit);
      return {
        section: { key: section, title: SECTION_TITLES[section], lines: result.lines },
        omittedCount: 0,
        hasStructuralEvidence: result.hasStructuralEvidence,
        hasSemanticEvidence: false,
      };
    }
    case "tests": {
      const result = await buildTestsSection(input.target, deps, limit);
      return {
        section: { key: section, title: SECTION_TITLES[section], lines: result.lines },
        omittedCount: 0,
        hasStructuralEvidence: result.hasStructuralEvidence,
        hasSemanticEvidence: false,
      };
    }
    case "diagnostics": {
      const result = await buildDiagnosticsSection(input.target, deps, limit);
      return {
        section: { key: section, title: SECTION_TITLES[section], lines: result.lines },
        omittedCount: 0,
        hasStructuralEvidence: false,
        hasSemanticEvidence: result.hasSemanticEvidence,
      };
    }
  }
}

// ── Real section builders for previously-stubbed sections ───────────

/**
 * Build the `tests` section: find companion test files and their test functions.
 */
async function buildTestsSection(
  target: ContextTarget | null | undefined,
  deps: ContextDeps,
  limit: number,
): Promise<{ lines: string[]; hasStructuralEvidence: boolean }> {
  if (!target) {
    return {
      lines: ["Tests unavailable without a precise target."],
      hasStructuralEvidence: false,
    };
  }

  const targetAbs = path.resolve(deps.cwd, target.file);
  if (!existsSync(targetAbs)) {
    return {
      lines: ["Tests unavailable — target file not found."],
      hasStructuralEvidence: false,
    };
  }

  const discovered = await discoverTestFilesForSource(targetAbs, {
    references: deps.provider?.references,
    outline: deps.provider?.outline,
    cwd: deps.cwd,
    cap: limit,
  });

  if (discovered.length === 0) {
    return {
      lines: ["No test companion files found for this target."],
      hasStructuralEvidence: false,
    };
  }

  const lines: string[] = [];
  const filesToScan = discovered.slice(0, 3);
  for (const testFile of filesToScan) {
    const relTestFile = toDisplayPath(deps.cwd, testFile.absPath);
    lines.push(`- \`${relTestFile}\``);
    for (const name of testFile.testNames.slice(0, limit)) {
      lines.push(`  - \`${name}\``);
    }
  }

  return { lines, hasStructuralEvidence: discovered.length > 0 };
}

/**
 * Build the `diagnostics` section: pull LSP diagnostics near the target.
 */
async function buildDiagnosticsSection(
  target: ContextTarget | null | undefined,
  deps: ContextDeps,
  limit: number,
): Promise<{ lines: string[]; hasSemanticEvidence: boolean }> {
  if (!target) {
    return {
      lines: ["Diagnostics unavailable without a precise target."],
      hasSemanticEvidence: false,
    };
  }

  if (deps.lspService.kind !== "ready") {
    return {
      lines: [
        "LSP not available — diagnostics require a live language server. Use `code_health` to check server status.",
      ],
      hasSemanticEvidence: false,
    };
  }

  try {
    const targetFile = path.resolve(deps.cwd, target.file);
    const diags = await deps.lspService.service.fileDiagnostics(targetFile, 4);
    if (!diags || diags.length === 0) {
      return {
        lines: ["No diagnostics found near this target."],
        hasSemanticEvidence: true,
      };
    }

    const lines: string[] = [];
    const nearby = diags.filter((d) => Math.abs((d.range.start.line ?? 0) + 1 - target.line) <= 5);
    const chosen = nearby.length > 0 ? nearby : diags;
    for (const d of chosen.slice(0, limit)) {
      const severity = (d.severity ?? 1) === 1 ? "ERROR" : "WARN";
      const line = (d.range.start.line ?? 0) + 1;
      lines.push(`- **${severity}** (L${line}): ${d.message}`);
    }
    return { lines, hasSemanticEvidence: true };
  } catch {
    return {
      lines: ["Diagnostics failed to load."],
      hasSemanticEvidence: false,
    };
  }
}

/**
 * Build the `docs` section: extract JSDoc/TSDoc comment preceding the target symbol.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: JSDoc parsing naturally has state-machine complexity
async function buildDocsSection(
  target: ContextTarget | null | undefined,
  deps: ContextDeps,
  limit: number,
): Promise<{ lines: string[]; hasStructuralEvidence: boolean }> {
  if (!target) {
    return {
      lines: ["Docs unavailable without a precise target."],
      hasStructuralEvidence: false,
    };
  }

  const targetFile = path.resolve(deps.cwd, target.file);
  if (!existsSync(targetFile)) {
    return {
      lines: ["Docs unavailable — target file not found."],
      hasStructuralEvidence: false,
    };
  }

  try {
    const content = readFileSync(targetFile, "utf-8");
    const lines = content.split("\n");

    // Scan backward from target.line for a /** ... */ JSDoc comment
    // LSP/pi use 1-based lines, so target.line is 1-based
    const startIdx = Math.max(0, target.line - 2); // 0-based
    let jsdocStart = -1;
    let jsdocEnd = -1;

    for (let i = startIdx; i >= 0; i--) {
      const line = lines[i].trim();

      // Single-line JSDoc: /** Description */
      if (line.startsWith("/**") && line.endsWith("*/")) {
        jsdocStart = i;
        jsdocEnd = i;
        break;
      }

      if (line === "*/") {
        jsdocEnd = i;
        continue;
      }

      // If we already found `*/` and are now scanning for `/**`
      if (jsdocEnd !== -1) {
        if (line.startsWith("/**")) {
          jsdocStart = i;
          break;
        }
        // Allow JSDoc body lines: *, @param, @return, etc.
        if (line.startsWith("*") || line.startsWith("@")) {
          continue;
        }
        // Hit non-JSDoc line before finding opening — no valid JSDoc
        if (line !== "") {
          jsdocStart = -1;
          jsdocEnd = -1;
          break;
        }
        continue;
      }

      // Haven't found `*/` yet — skip over JSDoc body lines or break on unrelated lines
      if (line.startsWith("*") || line.startsWith("/**")) {
        continue;
      }
      if (line !== "" && !line.startsWith("//")) {
        // Hit non-comment line before finding any JSDoc markers
        break;
      }
    }

    if (jsdocStart === -1 || jsdocEnd === -1) {
      return {
        lines: ["No JSDoc/TSDoc comment found for this symbol."],
        hasStructuralEvidence: false,
      };
    }

    const startIdx2 = jsdocStart;
    const endIdx = jsdocEnd;

    // Extract the doc text
    const docLines = lines
      .slice(startIdx2, endIdx + 1)
      .map((l) =>
        l
          .replace(/^\s*\*\s?/, "")
          .replace(/^\s*\/\*\*\s?/, "")
          .replace(/\s*\*\/\s*$/, ""),
      )
      .filter((l) => l.trim() !== "")
      .slice(0, limit);

    if (docLines.length === 0) {
      return {
        lines: ["No JSDoc/TSDoc comment found for this symbol."],
        hasStructuralEvidence: false,
      };
    }

    return {
      lines: ["```ts", ...docLines, "```"],
      hasStructuralEvidence: true,
    };
  } catch {
    return {
      lines: ["Docs extraction failed."],
      hasStructuralEvidence: false,
    };
  }
}

function toBriefInput(input: ContextInput, deps: ContextDeps): BriefInput {
  if (input.target) {
    if (input.target.name && deps.provider) {
      return {
        kind: "symbol",
        symbol: input.target.name,
        path: input.target.file,
        maxResults: input.maxResults,
      };
    }
    return {
      kind: "file",
      file: input.target.file,
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
      return 3;
    case "large":
      return 15;
    default:
      return 8;
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
    lines.push(...formatHoverLine(treeContext.hover.contents));
  }
  return lines;
}

/**
 * Format hover content for the definitions section.
 * Truncates at 600 characters to keep context bundles compact.
 */
function formatHoverLine(contents: string): string[] {
  const trimmed = contents.trim();
  const maxHoverChars = 600;
  if (trimmed.length <= maxHoverChars) {
    return [`- Hover: ${trimmed}`];
  }

  const hoverLines = trimmed.split("\n");
  if (hoverLines.length === 1) {
    return [
      `- Hover: ${trimmed.slice(0, maxHoverChars)}...`,
      `  _(truncated, use \`code_inspect\` for full type)_`,
    ];
  }

  // Multi-line — cut at line boundary before the character limit
  let acc = "";
  for (const line of hoverLines) {
    if (acc.length + line.length + 1 > maxHoverChars && acc.length > 0) break;
    acc += (acc ? "\n" : "") + line;
  }
  return [`- Hover: ${acc}`, `  _(truncated, use \`code_inspect\` for full type)_`];
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
    return ["Use `code_context` for a neutral orientation summary."];
  }

  const relPath = path.relative(cwd, target.file) || target.file;
  return [
    `\`code_graph\` with \`file: "${relPath}"\`, \`line: ${target.line}\`, and \`character: ${target.character}\` for deeper relation follow-up`,
    `\`code_impact\` with \`file: "${relPath}"\`, \`line: ${target.line}\`, and \`character: ${target.character}\` for blast-radius analysis`,
  ];
}

function hasRenderableItems(lines: string[]): boolean {
  return lines.some((line) => line.trim().startsWith("- "));
}
