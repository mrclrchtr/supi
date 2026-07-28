// biome-ignore-all lint/style/noExcessiveLinesPerFile: symbol-orientation section builders stay together to preserve one rendering contract
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import { uriToFile } from "@mrclrchtr/supi-core/path";
import type { Diagnostic } from "@mrclrchtr/supi-lsp/api";
import {
  createEvidenceList,
  createPartialEvidenceList,
  type EvidenceListMetadata,
} from "../../analysis/evidence.ts";
import {
  type ReadNextItem,
  readNextEnclosingScope,
  readNextTarget,
} from "../../analysis/read-next.ts";
import { diagnosticMessageString } from "../../substrate/lsp/utils.ts";
import { gatherTreeSitterContext } from "../../ui/markdown/gather.ts";
import type {
  OrientationDeps,
  OrientationInput,
  OrientationSection,
  OrientationTarget,
} from "../../ui/markdown/types.ts";
import type {
  OrientationBlock,
  OrientationResultData,
  OrientationSectionData,
} from "../orientation-types.ts";
import { collectContextOrientationFacts } from "./context-facts.ts";
import { formatSectionNote } from "./context-sections.ts";

interface CollectedOrientationSection {
  readonly key: OrientationSection;
  readonly title: string;
  readonly lines: readonly string[];
  readonly metadata: OrientationSectionData;
}

interface TargetSectionCollection {
  readonly lines: string[];
  readonly hasStructuralEvidence: boolean;
  readonly hasSemanticEvidence: boolean;
  readonly status: "complete" | "partial" | "unavailable";
  readonly reason: string | null;
  readonly evidenceLists: readonly EvidenceListMetadata[];
}

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
): Promise<OrientationResultData> {
  if (!input.target) return executeOrientationContext(input, deps);
  return executeTargetOrientation(input, deps);
}

async function executeOrientationContext(
  input: OrientationInput,
  deps: OrientationDeps,
): Promise<OrientationResultData> {
  return collectContextOrientationFacts({
    model: deps.model,
    provider: deps.provider,
    cwd: deps.cwd,
    focus: input.focus,
    maxResults: input.maxResults ?? 10,
    lspRuntime: deps.lspRuntime,
  });
}

async function executeTargetOrientation(
  input: OrientationInput,
  deps: OrientationDeps,
): Promise<OrientationResultData> {
  const requestedSections = DEFAULT_TARGET_SECTIONS;
  const limit = input.maxResults ?? 10;
  const focusTarget = input.target ? formatFocusTarget(input.target, deps.cwd) : null;
  const sections: CollectedOrientationSection[] = [];

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

  return {
    blocks: buildTargetBlocks(focusTarget, sections),
    sections: sections.map((section) => section.metadata),
    confidence,
    focusTarget,
    requestedSections,
    renderedSections: sections.map((section) => section.key),
    omittedCount: sections.reduce(
      (total, section) =>
        total +
        section.metadata.evidenceLists.reduce((sum, list) => sum + (list.omittedCount ?? 0), 0),
      0,
    ),
    nextQueries: buildNextQueries(input.target, deps.cwd),
    readNext: buildReadNextGuidance(input.target, treeContext, deps.cwd),
  };
}

async function buildRequestedSection(options: {
  section: OrientationSection;
  target: OrientationTarget | null | undefined;
  deps: OrientationDeps;
  limit: number;
  treeContext: Awaited<ReturnType<typeof maybeGatherTreeContext>>;
}): Promise<{
  section: CollectedOrientationSection;
  hasStructuralEvidence: boolean;
  hasSemanticEvidence: boolean;
}> {
  const { section, target, deps, limit, treeContext } = options;

  switch (section) {
    case "defs": {
      const result = await buildEnrichedDefsSection(target, deps, treeContext, limit);
      return targetSectionResult(section, result, [
        result.hasSemanticEvidence
          ? { source: "semantic", capability: "LSP" }
          : { source: "structural", capability: "tree-sitter" },
      ]);
    }
    case "docs":
      return targetSectionResult(section, await buildDocsSection(target, deps, limit), [
        { source: "filesystem", detail: "target source file" },
      ]);
    case "diagnostics":
      return targetSectionResult(section, await buildDiagnosticsSection(target, deps, limit), [
        { source: "semantic", capability: "LSP diagnostics" },
      ]);
  }
}

/** Build enriched defs section: tree-sitter definitions + LSP definition targets. */
async function buildEnrichedDefsSection(
  target: OrientationTarget | null | undefined,
  deps: OrientationDeps,
  treeContext: Awaited<ReturnType<typeof maybeGatherTreeContext>>,
  limit: number,
): Promise<TargetSectionCollection> {
  const lines = buildDefinitionLines(target, deps.cwd, treeContext);
  const contextHasSemanticEvidence = Boolean(
    treeContext?.hover || (treeContext?.definition?.length ?? 0) > 0,
  );
  const hasStructuralEvidence = hasRenderableItems(lines);

  if (!target) {
    return unavailableTargetSection(
      lines,
      hasStructuralEvidence,
      "Definitions require a precise target.",
    );
  }
  if (deps.lspRuntime.kind !== "ready") {
    return {
      lines,
      hasStructuralEvidence,
      hasSemanticEvidence: contextHasSemanticEvidence,
      status: contextHasSemanticEvidence ? "partial" : "unavailable",
      reason: "Definition targets require a live language server.",
      evidenceLists: [],
    };
  }

  const definitions = await collectDefinitionTargets(target, deps, limit);
  if (definitions.lines.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("**Definition:**", ...definitions.lines);
  }
  const hasSemanticEvidence = contextHasSemanticEvidence || definitions.hasSemanticEvidence;
  return {
    lines,
    hasStructuralEvidence,
    hasSemanticEvidence,
    status:
      definitions.status === "unavailable" && hasSemanticEvidence ? "partial" : definitions.status,
    reason: definitions.reason,
    evidenceLists: definitions.evidenceLists,
  };
}

async function collectDefinitionTargets(
  target: OrientationTarget,
  deps: OrientationDeps,
  limit: number,
): Promise<
  Pick<
    TargetSectionCollection,
    "lines" | "hasSemanticEvidence" | "status" | "reason" | "evidenceLists"
  >
> {
  if (!deps.provider?.definition) {
    return {
      lines: [],
      hasSemanticEvidence: false,
      status: "unavailable",
      reason: "Definition provider unavailable.",
      evidenceLists: [],
    };
  }
  try {
    const result = await deps.provider.definition(target.file, {
      line: target.line - 1,
      character: target.character - 1,
    });
    if (result.kind === "unavailable") {
      return {
        lines: [],
        hasSemanticEvidence: false,
        status: "unavailable",
        reason: result.reason,
        evidenceLists: [],
      };
    }
    const locations = result.data.map((definition) => {
      const filePath = uriToFile(definition.uri);
      const relPath = path.relative(deps.cwd, filePath);
      return `\`${relPath}:${definition.range.start.line + 1}:${definition.range.start.character + 1}\``;
    });
    const evidence =
      result.kind === "partial"
        ? createPartialEvidenceList({
            key: "orientation.definitionTargets",
            items: locations,
            maxResults: limit,
            partialReason: "provider-limited",
          })
        : createEvidenceList({
            key: "orientation.definitionTargets",
            items: locations,
            maxResults: limit,
          });
    return {
      lines: evidence.items,
      hasSemanticEvidence: true,
      status: result.kind === "partial" ? "partial" : "complete",
      reason: result.kind === "partial" ? result.reason : null,
      evidenceLists: [evidence.metadata],
    };
  } catch (error) {
    return {
      lines: [],
      hasSemanticEvidence: false,
      status: "unavailable",
      reason: `Definition provider failed: ${String(error)}`,
      evidenceLists: [],
    };
  }
}

async function buildDiagnosticsSection(
  target: OrientationTarget | null | undefined,
  deps: OrientationDeps,
  limit: number,
): Promise<TargetSectionCollection> {
  if (!target) {
    return unavailableTargetSection([], false, "Diagnostics require a precise target.");
  }
  if (deps.lspRuntime.kind !== "ready") {
    return unavailableTargetSection(
      [
        "LSP not available — diagnostics require a live language server. Use `code_health` to check server status.",
      ],
      false,
      "Diagnostics require a live language server.",
    );
  }

  try {
    const targetFile = path.resolve(deps.cwd, target.file);
    const result = await deps.lspRuntime.runtime.fileDiagnostics(targetFile, 4);
    if (result.kind === "unavailable") {
      return unavailableTargetSection(
        [`Diagnostics unavailable for this target — ${result.reason}`],
        false,
        result.reason,
      );
    }
    const nearby = result.data.filter(
      (diagnostic) => Math.abs((diagnostic.range.start.line ?? 0) + 1 - target.line) <= 5,
    );
    const evidence =
      result.kind === "partial"
        ? createPartialEvidenceList({
            key: "orientation.diagnostics",
            items: nearby,
            maxResults: limit,
            partialReason: "provider-limited",
          })
        : createEvidenceList({
            key: "orientation.diagnostics",
            items: nearby,
            maxResults: limit,
          });
    return {
      lines:
        evidence.items.length === 0
          ? ["No diagnostics found near this target."]
          : evidence.items.map((diagnostic) => formatDiagnostic(diagnostic)),
      hasStructuralEvidence: false,
      hasSemanticEvidence: true,
      status: result.kind === "partial" ? "partial" : "complete",
      reason: result.kind === "partial" ? result.reason : null,
      evidenceLists: [evidence.metadata],
    };
  } catch (error) {
    return unavailableTargetSection(
      ["Diagnostics failed to load."],
      false,
      `Diagnostics failed to load: ${String(error)}`,
    );
  }
}

function formatDiagnostic(diagnostic: Diagnostic): string {
  const severity = (diagnostic.severity ?? 1) === 1 ? "ERROR" : "WARN";
  return `- **${severity}** (L${(diagnostic.range.start.line ?? 0) + 1}): ${diagnosticMessageString(diagnostic)}`;
}

function completedDocsSection(
  lines: string[],
  evidenceLists: readonly EvidenceListMetadata[],
): TargetSectionCollection {
  return {
    lines,
    hasStructuralEvidence: false,
    hasSemanticEvidence: false,
    status: "complete",
    reason: null,
    evidenceLists,
  };
}

function unavailableTargetSection(
  lines: string[],
  hasStructuralEvidence: boolean,
  reason: string,
): TargetSectionCollection {
  return {
    lines,
    hasStructuralEvidence,
    hasSemanticEvidence: false,
    status: "unavailable",
    reason,
    evidenceLists: [],
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: JSDoc parsing naturally has state-machine complexity
async function buildDocsSection(
  target: OrientationTarget | null | undefined,
  deps: OrientationDeps,
  limit: number,
): Promise<TargetSectionCollection> {
  if (!target) {
    return unavailableTargetSection(
      ["Docs unavailable without a precise target."],
      false,
      "Docs require a precise target.",
    );
  }

  const targetFile = path.resolve(deps.cwd, target.file);
  if (!existsSync(targetFile)) {
    return unavailableTargetSection(
      ["Docs unavailable — target file not found."],
      false,
      "Target file not found.",
    );
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
      return completedDocsSection(["No JSDoc/TSDoc comment found for this symbol."], []);
    }

    const docLines = lines
      .slice(jsdocStart, jsdocEnd + 1)
      .map((line) =>
        line
          .replace(/^\s*\/\*\*\s?/, "")
          .replace(/\s*\*\/\s*$/, "")
          .replace(/^\s*\*\s?/, ""),
      )
      .filter((line) => line.trim() !== "");

    if (docLines.length === 0) {
      return completedDocsSection(["No JSDoc/TSDoc comment found for this symbol."], []);
    }

    const evidence = createEvidenceList({
      key: "orientation.docs",
      items: docLines,
      maxResults: limit,
    });
    return completedDocsSection(["```ts", ...evidence.items, "```"], [evidence.metadata]);
  } catch (error) {
    return unavailableTargetSection(
      ["Docs extraction failed."],
      false,
      `Docs extraction failed: ${String(error)}`,
    );
  }
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
  if (trimmed.startsWith("```")) {
    return formatFencedHover(trimmed, maxHoverChars);
  }
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

/** Keep provider-supplied Markdown fences at block boundaries understood by sectionBlocks(). */
function formatFencedHover(contents: string, maxChars: number): string[] {
  const sourceLines = contents.split("\n");
  if (contents.length <= maxChars) return ["- Hover:", ...sourceLines];

  const lines = [sourceLines[0]];
  let length = sourceLines[0].length;
  let closed = false;
  for (const line of sourceLines.slice(1)) {
    if (length + line.length + 1 > maxChars) break;
    lines.push(line);
    length += line.length + 1;
    if (line.startsWith("```")) closed = true;
  }
  if (!closed) lines.push("```");
  return ["- Hover:", ...lines, "_(truncated, use `code_inspect` for full type)_"];
}

function formatFocusTarget(target: OrientationTarget, cwd: string): string {
  const relPath = path.relative(cwd, target.file) || target.file;
  return `${relPath}:${target.line}:${target.character}`;
}

function buildNextQueries(target: OrientationTarget | null | undefined, cwd: string): string[] {
  if (!target) return ["Use `code_orientation` for a neutral orientation summary."];

  const relPath = path.relative(cwd, target.file) || target.file;
  return [
    `\`code_graph\` with \`target: { anchor: { file: "${relPath}", line: ${target.line}, character: ${target.character} } }\` for relation follow-up`,
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

function targetSectionResult(
  key: OrientationSection,
  collection: TargetSectionCollection,
  provenance: OrientationSectionData["provenance"],
): {
  section: CollectedOrientationSection;
  hasStructuralEvidence: boolean;
  hasSemanticEvidence: boolean;
} {
  const confidence: ConfidenceMode = collection.hasSemanticEvidence
    ? "semantic"
    : collection.hasStructuralEvidence
      ? "structural"
      : "unavailable";
  return {
    section: {
      key,
      title: SECTION_TITLES[key],
      lines: collection.lines,
      metadata: {
        key,
        title: SECTION_TITLES[key],
        status: collection.status,
        reason: collection.reason,
        confidence,
        provenance,
        evidenceLists: collection.evidenceLists,
      },
    },
    hasStructuralEvidence: collection.hasStructuralEvidence,
    hasSemanticEvidence: collection.hasSemanticEvidence,
  };
}

function buildTargetBlocks(
  focusTarget: string | null,
  sections: readonly CollectedOrientationSection[],
): OrientationBlock[] {
  const blocks: OrientationBlock[] = [
    { kind: "heading", level: 1, text: "Code Orientation" },
    { kind: "blank" },
  ];
  if (focusTarget) {
    blocks.push(
      { kind: "heading", level: 2, text: "Focus" },
      { kind: "list-item", text: `\`${focusTarget}\`` },
      { kind: "blank" },
    );
  }
  for (const section of sections) {
    blocks.push(
      { kind: "heading", level: 2, text: section.title },
      { kind: "paragraph", text: formatSectionNote(section.metadata) },
    );
    blocks.push(...sectionBlocks(section.lines.join("\n")), { kind: "blank" });
  }
  return blocks;
}

interface SectionBlockState {
  blocks: OrientationBlock[];
  codeLanguage: string | null;
  codeLines: string[];
}

/** Convert target-section fragments into typed blocks. Context Orientation never crosses a markdown seam. */
function sectionBlocks(document: string): OrientationBlock[] {
  const state: SectionBlockState = { blocks: [], codeLanguage: null, codeLines: [] };
  for (const line of document.split("\n")) appendSectionLine(state, line);
  closeCodeBlock(state);
  return state.blocks;
}

function appendSectionLine(state: SectionBlockState, line: string): void {
  if (line.startsWith("```")) {
    toggleCodeBlock(state, line.slice(3).trim());
    return;
  }
  if (state.codeLanguage !== null) {
    state.codeLines.push(line);
    return;
  }
  appendProseBlock(state.blocks, line);
}

function toggleCodeBlock(state: SectionBlockState, language: string): void {
  if (state.codeLanguage === null) {
    state.codeLanguage = language;
    return;
  }
  closeCodeBlock(state);
}

function closeCodeBlock(state: SectionBlockState): void {
  if (state.codeLanguage === null) return;
  state.blocks.push({
    kind: "code",
    language: state.codeLanguage.length > 0 ? state.codeLanguage : null,
    lines: state.codeLines,
  });
  state.codeLanguage = null;
  state.codeLines = [];
}

function appendProseBlock(blocks: OrientationBlock[], line: string): void {
  const heading = /^(#{1,3})\s+(.*)$/.exec(line);
  if (heading) {
    blocks.push({
      kind: "heading",
      level: heading[1].length as 1 | 2 | 3,
      text: heading[2],
    });
    return;
  }
  if (line.startsWith("- ")) {
    blocks.push({ kind: "list-item", text: line.slice(2) });
  } else if (line.trim().length === 0) {
    blocks.push({ kind: "blank" });
  } else {
    blocks.push({ kind: "paragraph", text: line });
  }
}

function hasRenderableItems(lines: string[]): boolean {
  return lines.some((line) => line.trim().startsWith("- "));
}
