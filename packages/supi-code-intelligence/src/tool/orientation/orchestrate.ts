// biome-ignore-all lint/style/noExcessiveLinesPerFile: symbol-orientation section builders stay together to preserve one rendering contract
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";

import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { BriefInput } from "../../analysis/brief/types.ts";
import { executeBrief } from "../../analysis/brief/use-case.ts";
import {
  type ReadNextItem,
  readNextEnclosingScope,
  readNextTarget,
} from "../../analysis/read-next.ts";
import type { ContextDetails } from "../../types/details.ts";
import { gatherTreeSitterContext } from "../../ui/markdown/gather.ts";
import type {
  OrientationDeps,
  OrientationInput,
  OrientationSection,
  OrientationTarget,
  OrientationUseCaseResult,
} from "../../ui/markdown/types.ts";
import { type RenderedOrientationSection, renderOrientationResult } from "./markdown.ts";

const DEFAULT_TARGET_SECTIONS: OrientationSection[] = ["defs", "docs", "diagnostics"];

const SECTION_TITLES: Record<OrientationSection, string> = {
  defs: "Definitions",
  docs: "Docs",
  diagnostics: "Diagnostics",
};

/**
 * Build a code_orientation result.
 *
 * - Without a precise target, returns a neutral project/module/directory/file orientation brief.
 * - With a precise target, returns symbol-centered orientation facts: definitions, docs, and local diagnostics.
 */
export async function executeOrientation(
  input: OrientationInput,
  deps: OrientationDeps,
): Promise<OrientationUseCaseResult> {
  if (!input.target) {
    return executeOrientationContext(input, deps);
  }

  return executeTargetOrientation(input, deps);
}

async function executeOrientationContext(
  input: OrientationInput,
  deps: OrientationDeps,
): Promise<OrientationUseCaseResult> {
  const briefInput = toBriefInput(input);
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
    focusTarget: input.focus ?? null,
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

async function executeTargetOrientation(
  input: OrientationInput,
  deps: OrientationDeps,
): Promise<OrientationUseCaseResult> {
  const requestedSections = DEFAULT_TARGET_SECTIONS;
  const limit = input.maxResults ?? 10;
  const focusTarget = input.target ? formatFocusTarget(input.target, deps.cwd) : null;
  const sections: RenderedOrientationSection[] = [];

  let hasStructural = false;
  let hasSemantic = false;
  const treeContext = await maybeGatherTreeContext(input.target, deps);

  for (const section of requestedSections) {
    const built = await buildRequestedSection({
      section,
      target: input.target,
      deps,
      limit,
      treeContext,
    });
    sections.push(built.section);
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
    renderedSections: sections.map((section) => section.key),
    omittedCount: 0,
    nextQueries: buildNextQueries(input.target, deps.cwd),
  };

  return {
    content: renderOrientationResult({
      focusTarget,
      sections,
      readNext: buildReadNextGuidance(input.target, treeContext, deps.cwd),
    }),
    details,
  };
}

async function buildRequestedSection(options: {
  section: OrientationSection;
  target: OrientationTarget | null | undefined;
  deps: OrientationDeps;
  limit: number;
  treeContext: Awaited<ReturnType<typeof maybeGatherTreeContext>>;
}): Promise<{
  section: RenderedOrientationSection;
  hasStructuralEvidence: boolean;
  hasSemanticEvidence: boolean;
}> {
  const { section, target, deps, limit, treeContext } = options;

  switch (section) {
    case "defs": {
      const lines = await buildEnrichedDefsSection(target, deps, treeContext, limit);
      return {
        section: { key: section, title: SECTION_TITLES[section], lines },
        hasStructuralEvidence: hasRenderableItems(lines),
        hasSemanticEvidence: deps.lspService.kind === "ready",
      };
    }
    case "docs": {
      const result = await buildDocsSection(target, deps, limit);
      return {
        section: { key: section, title: SECTION_TITLES[section], lines: result.lines },
        hasStructuralEvidence: result.hasStructuralEvidence,
        hasSemanticEvidence: false,
      };
    }
    case "diagnostics": {
      const result = await buildDiagnosticsSection(target, deps, limit);
      return {
        section: { key: section, title: SECTION_TITLES[section], lines: result.lines },
        hasStructuralEvidence: false,
        hasSemanticEvidence: result.hasSemanticEvidence,
      };
    }
  }
}

/** Build enriched defs section: tree-sitter definitions + LSP definition targets + code actions. */
async function buildEnrichedDefsSection(
  target: OrientationTarget | null | undefined,
  deps: OrientationDeps,
  treeContext: Awaited<ReturnType<typeof maybeGatherTreeContext>>,
  limit: number,
): Promise<string[]> {
  const lines = buildDefinitionLines(target, deps.cwd, treeContext);

  if (!target || deps.lspService.kind !== "ready") return lines;

  const lspDefs = await appendDefinitionTargets(target, deps, limit);
  if (lspDefs.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(...lspDefs.slice(0, limit));
  }

  const actions = await appendCodeActions(target, deps, limit);
  if (actions.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(...actions.slice(0, limit));
  }

  return lines;
}

async function appendDefinitionTargets(
  target: OrientationTarget,
  deps: OrientationDeps,
  limit: number,
): Promise<string[]> {
  if (!deps.provider?.definition) return [];
  try {
    const defs = await deps.provider.definition(target.file, {
      line: target.line - 1,
      character: target.character - 1,
    });
    if (!defs || !Array.isArray(defs) || defs.length === 0) return [];
    const lines: string[] = ["**Definition:**"];
    for (const def of defs.slice(0, limit)) {
      const filePath = def.uri.startsWith("file://")
        ? decodeURIComponent(def.uri.slice(7))
        : def.uri;
      const relPath = path.relative(deps.cwd, filePath);
      lines.push(`- \`${relPath}:${def.range.start.line + 1}:${def.range.start.character + 1}\``);
    }
    return lines;
  } catch {
    return [];
  }
}

async function appendCodeActions(
  target: OrientationTarget,
  deps: OrientationDeps,
  limit: number,
): Promise<string[]> {
  if (deps.lspService.kind !== "ready" || !deps.lspService.service) return [];
  try {
    const actions = await deps.lspService.service.codeActions(target.file, {
      line: target.line - 1,
      character: target.character - 1,
    });
    if (!actions || actions.length === 0) return [];
    const lines: string[] = ["**Code Actions:**"];
    for (const action of actions.slice(0, limit)) {
      const kindLabel = action.kind ? ` (${action.kind})` : "";
      lines.push(`- ${action.title}${kindLabel}`);
    }
    return lines;
  } catch {
    return [];
  }
}

async function buildDiagnosticsSection(
  target: OrientationTarget | null | undefined,
  deps: OrientationDeps,
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
      return { lines: ["No diagnostics found near this target."], hasSemanticEvidence: true };
    }

    const nearby = diags.filter((d) => Math.abs((d.range.start.line ?? 0) + 1 - target.line) <= 5);
    if (nearby.length === 0) {
      return { lines: ["No diagnostics found near this target."], hasSemanticEvidence: true };
    }

    const lines: string[] = [];
    for (const d of nearby.slice(0, limit)) {
      const severity = (d.severity ?? 1) === 1 ? "ERROR" : "WARN";
      const line = (d.range.start.line ?? 0) + 1;
      lines.push(`- **${severity}** (L${line}): ${d.message}`);
    }
    return { lines, hasSemanticEvidence: true };
  } catch {
    return { lines: ["Diagnostics failed to load."], hasSemanticEvidence: false };
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: JSDoc parsing naturally has state-machine complexity
async function buildDocsSection(
  target: OrientationTarget | null | undefined,
  deps: OrientationDeps,
  limit: number,
): Promise<{ lines: string[]; hasStructuralEvidence: boolean }> {
  if (!target) {
    return { lines: ["Docs unavailable without a precise target."], hasStructuralEvidence: false };
  }

  const targetFile = path.resolve(deps.cwd, target.file);
  if (!existsSync(targetFile)) {
    return { lines: ["Docs unavailable — target file not found."], hasStructuralEvidence: false };
  }

  try {
    const content = readFileSync(targetFile, "utf-8");
    const lines = content.split("\n");
    const startIdx = Math.max(0, target.line - 2);
    let jsdocStart = -1;
    let jsdocEnd = -1;

    for (let i = startIdx; i >= 0; i--) {
      const line = lines[i].trim();

      if (line.startsWith("/**") && line.endsWith("*/")) {
        jsdocStart = i;
        jsdocEnd = i;
        break;
      }

      if (line === "*/") {
        jsdocEnd = i;
        continue;
      }

      if (jsdocEnd !== -1) {
        if (line.startsWith("/**")) {
          jsdocStart = i;
          break;
        }
        if (line.startsWith("*") || line.startsWith("@")) continue;
        if (line !== "") {
          jsdocStart = -1;
          jsdocEnd = -1;
          break;
        }
        continue;
      }

      if (line.startsWith("*") || line.startsWith("/**")) continue;
      if (line !== "" && !line.startsWith("//")) break;
    }

    if (jsdocStart === -1 || jsdocEnd === -1) {
      return {
        lines: ["No JSDoc/TSDoc comment found for this symbol."],
        hasStructuralEvidence: false,
      };
    }

    const docLines = lines
      .slice(jsdocStart, jsdocEnd + 1)
      .map((line) =>
        line
          .replace(/^\s*\*\s?/, "")
          .replace(/^\s*\/\*\*\s?/, "")
          .replace(/\s*\*\/\s*$/, ""),
      )
      .filter((line) => line.trim() !== "")
      .slice(0, limit);

    if (docLines.length === 0) {
      return {
        lines: ["No JSDoc/TSDoc comment found for this symbol."],
        hasStructuralEvidence: false,
      };
    }

    return { lines: ["```ts", ...docLines, "```"], hasStructuralEvidence: true };
  } catch {
    return { lines: ["Docs extraction failed."], hasStructuralEvidence: false };
  }
}

function toBriefInput(input: OrientationInput): BriefInput {
  if (input.focus) return { kind: "path", path: input.focus, maxResults: input.maxResults };
  return { kind: "project", maxResults: input.maxResults };
}

async function maybeGatherTreeContext(
  target: OrientationTarget | null | undefined,
  deps: OrientationDeps,
) {
  if (!target) return null;
  const relPath = path.relative(deps.cwd, target.file);
  return gatherTreeSitterContext(deps.provider, relPath, target.line, target.character);
}

function buildDefinitionLines(
  target: OrientationTarget | null | undefined,
  cwd: string,
  treeContext: Awaited<ReturnType<typeof maybeGatherTreeContext>>,
): string[] {
  if (!target) return ["No precise target context found."];

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

function formatHoverLine(contents: string): string[] {
  const trimmed = contents.trim();
  const maxHoverChars = 600;
  if (trimmed.length <= maxHoverChars) return [`- Hover: ${trimmed}`];

  const hoverLines = trimmed.split("\n");
  if (hoverLines.length === 1) {
    return [
      `- Hover: ${trimmed.slice(0, maxHoverChars)}...`,
      "  _(truncated, use `code_inspect` for full type)_",
    ];
  }

  let acc = "";
  for (const line of hoverLines) {
    if (acc.length + line.length + 1 > maxHoverChars && acc.length > 0) break;
    acc += (acc ? "\n" : "") + line;
  }
  return [`- Hover: ${acc}`, "  _(truncated, use `code_inspect` for full type)_"];
}

function formatFocusTarget(target: OrientationTarget, cwd: string): string {
  const relPath = path.relative(cwd, target.file) || target.file;
  return `${relPath}:${target.line}:${target.character}`;
}

function buildNextQueries(target: OrientationTarget | null | undefined, cwd: string): string[] {
  if (!target) return ["Use `code_orientation` for a neutral orientation summary."];

  const relPath = path.relative(cwd, target.file) || target.file;
  return [
    `\`code_graph\` with \`file: "${relPath}"\`, \`line: ${target.line}\`, and \`character: ${target.character}\` for relation follow-up`,
    `\`code_impact\` with \`file: "${relPath}"\`, \`line: ${target.line}\`, and \`character: ${target.character}\` for blast-radius analysis`,
  ];
}

function buildReadNextGuidance(
  target: OrientationTarget | null | undefined,
  treeContext: Awaited<ReturnType<typeof maybeGatherTreeContext>>,
  cwd: string,
): ReadNextItem[] {
  if (!target) return [];
  const relPath = path.relative(cwd, target.file) || target.file;
  const enclosing = findEnclosingOutlineItem(target, treeContext);
  if (enclosing) {
    return [readNextEnclosingScope(relPath, enclosing, target.line)];
  }
  return [readNextTarget(relPath, target.line, "inspect the target implementation")];
}

function findEnclosingOutlineItem(
  target: OrientationTarget,
  treeContext: Awaited<ReturnType<typeof maybeGatherTreeContext>>,
): { name: string; kind: string; startLine: number; endLine: number } | null {
  if (!treeContext || treeContext.outline.length === 0) return null;
  const candidates = treeContext.outline.filter(
    (item) => item.startLine <= target.line && item.endLine >= target.line,
  );
  if (candidates.length === 0) return null;
  const matchingName = candidates.find((item) => target.name && item.name === target.name);
  if (matchingName) return matchingName;
  return candidates.sort(
    (left, right) => left.endLine - left.startLine - (right.endLine - right.startLine),
  )[0];
}

function hasRenderableItems(lines: string[]): boolean {
  return lines.some((line) => line.trim().startsWith("- "));
}
