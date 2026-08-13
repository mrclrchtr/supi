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
import type {
  OrientationDeps,
  OrientationInput,
  OrientationItem,
  OrientationResultData,
  OrientationSection,
  OrientationSectionData,
} from "../orientation-types.ts";
import type { TargetStoreEntry } from "../target-store.ts";
import { collectContextOrientationFacts } from "./context-facts.ts";
import { gatherSubstrateContext } from "./gather.ts";

interface TargetSectionCollection {
  readonly items: OrientationItem[];
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
    requestControl: deps.requestControl,
  });
}

async function executeTargetOrientation(
  input: OrientationInput,
  deps: OrientationDeps,
): Promise<OrientationResultData> {
  const requestedSections = DEFAULT_TARGET_SECTIONS;
  const limit = input.maxResults ?? 10;
  const focusTarget = input.target ? formatFocusTarget(input.target, deps.cwd) : null;
  const sections: OrientationSectionData[] = [];

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
    title: "Code Orientation",
    notes: [],
    sections,
    confidence,
    focusTarget,
    requestedSections,
    renderedSections: sections.map((section) => section.key),
    omittedCount: sections.reduce(
      (total, section) =>
        total + section.evidenceLists.reduce((sum, list) => sum + (list.omittedCount ?? 0), 0),
      0,
    ),
    nextQueries: buildNextQueries(input.target, deps.cwd),
    readNext: buildReadNextGuidance(input.target, treeContext, deps.cwd),
  };
}

async function buildRequestedSection(options: {
  section: OrientationSection;
  target: Readonly<TargetStoreEntry> | null | undefined;
  deps: OrientationDeps;
  limit: number;
  treeContext: Awaited<ReturnType<typeof maybeGatherTreeContext>>;
}): Promise<{
  section: OrientationSectionData;
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
  target: Readonly<TargetStoreEntry> | null | undefined,
  deps: OrientationDeps,
  treeContext: Awaited<ReturnType<typeof maybeGatherTreeContext>>,
  limit: number,
): Promise<TargetSectionCollection> {
  const items = buildDefinitionItems(target, deps.cwd, treeContext);
  const contextHasSemanticEvidence = Boolean(
    treeContext?.hover || (treeContext?.definition?.length ?? 0) > 0,
  );
  const hasStructuralEvidence = hasRenderableItems(items);

  if (!target) {
    return unavailableTargetSection(
      items,
      hasStructuralEvidence,
      "Definitions require a precise target.",
    );
  }
  if (deps.lspRuntime.kind !== "ready") {
    return {
      items,
      hasStructuralEvidence,
      hasSemanticEvidence: contextHasSemanticEvidence,
      status: contextHasSemanticEvidence ? "partial" : "unavailable",
      reason: "Definition targets require a live language server.",
      evidenceLists: [],
    };
  }

  const definitions = await collectDefinitionTargets(target, deps, limit);
  if (definitions.items.length > 0) {
    if (items.length > 0) items.push({ kind: "blank" });
    items.push({ kind: "paragraph", text: "**Definition:**" }, ...definitions.items);
  }
  const hasSemanticEvidence = contextHasSemanticEvidence || definitions.hasSemanticEvidence;
  return {
    items,
    hasStructuralEvidence,
    hasSemanticEvidence,
    status:
      definitions.status === "unavailable" && hasSemanticEvidence ? "partial" : definitions.status,
    reason: definitions.reason,
    evidenceLists: definitions.evidenceLists,
  };
}

async function collectDefinitionTargets(
  target: Readonly<TargetStoreEntry>,
  deps: OrientationDeps,
  limit: number,
): Promise<
  Pick<
    TargetSectionCollection,
    "items" | "hasSemanticEvidence" | "status" | "reason" | "evidenceLists"
  >
> {
  if (!deps.provider?.definition) {
    return {
      items: [],
      hasSemanticEvidence: false,
      status: "unavailable",
      reason: "Definition provider unavailable.",
      evidenceLists: [],
    };
  }
  try {
    const result = await deps.provider.definition(target.file, {
      line: target.displayLine - 1,
      character: target.displayCharacter - 1,
    });
    if (result.kind === "unavailable") {
      return {
        items: [],
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
      items: evidence.items.map((location) => ({ kind: "paragraph", text: location })),
      hasSemanticEvidence: true,
      status: result.kind === "partial" ? "partial" : "complete",
      reason: result.kind === "partial" ? result.reason : null,
      evidenceLists: [evidence.metadata],
    };
  } catch (error) {
    return {
      items: [],
      hasSemanticEvidence: false,
      status: "unavailable",
      reason: `Definition provider failed: ${String(error)}`,
      evidenceLists: [],
    };
  }
}

async function buildDiagnosticsSection(
  target: Readonly<TargetStoreEntry> | null | undefined,
  deps: OrientationDeps,
  limit: number,
): Promise<TargetSectionCollection> {
  if (!target) {
    return unavailableTargetSection([], false, "Diagnostics require a precise target.");
  }
  if (deps.lspRuntime.kind !== "ready") {
    return unavailableTargetSection(
      [
        {
          kind: "paragraph",
          text: "LSP not available — diagnostics require a live language server. Use `code_health` to check server status.",
        },
      ],
      false,
      "Diagnostics require a live language server.",
    );
  }

  try {
    const targetFile = path.resolve(deps.cwd, target.file);
    const result = await deps.lspRuntime.runtime.fileDiagnostics(
      targetFile,
      4,
      deps.requestControl,
    );
    if (result.kind === "unavailable") {
      return unavailableTargetSection(
        [{ kind: "paragraph", text: `Diagnostics unavailable for this target — ${result.reason}` }],
        false,
        result.reason,
      );
    }
    const nearby = result.data.filter(
      (diagnostic) => Math.abs((diagnostic.range.start.line ?? 0) + 1 - target.displayLine) <= 5,
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
      items:
        evidence.items.length === 0
          ? [{ kind: "paragraph", text: "No diagnostics found near this target." }]
          : evidence.items.map((diagnostic) => formatDiagnosticItem(diagnostic)),
      hasStructuralEvidence: false,
      hasSemanticEvidence: true,
      status: result.kind === "partial" ? "partial" : "complete",
      reason: result.kind === "partial" ? result.reason : null,
      evidenceLists: [evidence.metadata],
    };
  } catch (error) {
    return unavailableTargetSection(
      [{ kind: "paragraph", text: "Diagnostics failed to load." }],
      false,
      `Diagnostics failed to load: ${String(error)}`,
    );
  }
}

function formatDiagnosticItem(diagnostic: Diagnostic): OrientationItem {
  const severity = (diagnostic.severity ?? 1) === 1 ? "ERROR" : "WARN";
  return {
    kind: "list-item",
    text: `**${severity}** (L${(diagnostic.range.start.line ?? 0) + 1}): ${diagnosticMessageString(diagnostic)}`,
  };
}

function completedDocsSection(
  items: OrientationItem[],
  evidenceLists: readonly EvidenceListMetadata[],
): TargetSectionCollection {
  return {
    items,
    hasStructuralEvidence: false,
    hasSemanticEvidence: false,
    status: "complete",
    reason: null,
    evidenceLists,
  };
}

function unavailableTargetSection(
  items: OrientationItem[],
  hasStructuralEvidence: boolean,
  reason: string,
): TargetSectionCollection {
  return {
    items,
    hasStructuralEvidence,
    hasSemanticEvidence: false,
    status: "unavailable",
    reason,
    evidenceLists: [],
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: JSDoc parsing naturally has state-machine complexity
async function buildDocsSection(
  target: Readonly<TargetStoreEntry> | null | undefined,
  deps: OrientationDeps,
  limit: number,
): Promise<TargetSectionCollection> {
  if (!target) {
    return unavailableTargetSection(
      [{ kind: "paragraph", text: "Docs unavailable without a precise target." }],
      false,
      "Docs require a precise target.",
    );
  }

  const targetFile = path.resolve(deps.cwd, target.file);
  if (!existsSync(targetFile)) {
    return unavailableTargetSection(
      [{ kind: "paragraph", text: "Docs unavailable — target file not found." }],
      false,
      "Target file not found.",
    );
  }

  try {
    const content = readFileSync(targetFile, "utf-8");
    const lines = content.split("\n");
    const startIdx = Math.max(0, target.displayLine - 2);
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
      return completedDocsSection(
        [{ kind: "paragraph", text: "No JSDoc/TSDoc comment found for this symbol." }],
        [],
      );
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
      return completedDocsSection(
        [{ kind: "paragraph", text: "No JSDoc/TSDoc comment found for this symbol." }],
        [],
      );
    }

    const evidence = createEvidenceList({
      key: "orientation.docs",
      items: docLines,
      maxResults: limit,
    });
    return completedDocsSection(
      [{ kind: "code", language: "ts", lines: evidence.items }],
      [evidence.metadata],
    );
  } catch (error) {
    return unavailableTargetSection(
      [{ kind: "paragraph", text: "Docs extraction failed." }],
      false,
      `Docs extraction failed: ${String(error)}`,
    );
  }
}

async function maybeGatherTreeContext(
  target: Readonly<TargetStoreEntry> | null | undefined,
  deps: OrientationDeps,
) {
  if (!target) return null;
  const relPath = path.relative(deps.cwd, target.file);
  return gatherSubstrateContext(
    deps.provider,
    relPath,
    target.displayLine,
    target.displayCharacter,
    target.anchorKind !== "declaration",
    deps.requestControl,
  );
}

function buildDefinitionItems(
  target: Readonly<TargetStoreEntry> | null | undefined,
  cwd: string,
  treeContext: Awaited<ReturnType<typeof maybeGatherTreeContext>>,
): OrientationItem[] {
  if (!target) return [{ kind: "paragraph", text: "No precise target context found." }];

  const items: OrientationItem[] = [
    { kind: "list-item", text: `Focus: \`${formatFocusTarget(target, cwd)}\`` },
  ];
  if (target.name) {
    items.push({
      kind: "list-item",
      text: `Symbol: \`${target.name}\`${target.kind ? ` (${target.kind})` : ""}`,
    });
  }
  if (target.anchorKind === "declaration") {
    items.push({
      kind: "paragraph",
      text: "Node and hover evidence withheld: this target has a declaration anchor, and position-strict substrates require a name anchor (ADR 0003).",
    });
  }
  if (treeContext?.nodeInfo?.type) {
    items.push({ kind: "list-item", text: `Node: \`${treeContext.nodeInfo.type}\`` });
  }
  if (treeContext?.hover?.contents) {
    items.push(...hoverItems(treeContext.hover.contents));
  }
  return items;
}

const MAX_HOVER_CHARS = 600;
const HOVER_TRUNCATED_NOTE = "_(truncated, use `code_inspect` for full type)_";

function hoverItems(contents: string): OrientationItem[] {
  const trimmed = contents.trim();
  if (!trimmed.startsWith("```")) {
    if (trimmed.length <= MAX_HOVER_CHARS)
      return [{ kind: "list-item", text: `Hover: ${trimmed}` }];
    return [
      { kind: "list-item", text: `Hover: ${clipHoverText(trimmed)}...` },
      { kind: "paragraph", text: HOVER_TRUNCATED_NOTE },
    ];
  }
  const { lines, truncated } = clipHoverLines(trimmed);
  const items: OrientationItem[] = [
    { kind: "list-item", text: "Hover:" },
    ...hoverBodyItems(lines),
  ];
  if (truncated) items.push({ kind: "paragraph", text: HOVER_TRUNCATED_NOTE });
  return items;
}

function clipHoverText(trimmed: string): string {
  const lines = trimmed.split("\n");
  if (lines.length === 1) return trimmed.slice(0, MAX_HOVER_CHARS);
  let acc = "";
  for (const line of lines) {
    if (acc.length + line.length + 1 > MAX_HOVER_CHARS && acc.length > 0) break;
    acc += (acc ? "\n" : "") + line;
  }
  return acc;
}

function clipHoverLines(contents: string): { lines: string[]; truncated: boolean } {
  const sourceLines = contents.split("\n");
  if (contents.length <= MAX_HOVER_CHARS) return { lines: sourceLines, truncated: false };
  const lines = [sourceLines[0]];
  let length = sourceLines[0].length;
  for (const line of sourceLines.slice(1)) {
    if (length + line.length + 1 > MAX_HOVER_CHARS) break;
    lines.push(line);
    length += line.length + 1;
  }
  return { lines, truncated: true };
}

/** Parse provider hover Markdown (fenced code + prose) into rendered items. */
function hoverBodyItems(lines: readonly string[]): OrientationItem[] {
  const items: OrientationItem[] = [];
  let codeLanguage: string | null = null;
  let codeLines: string[] = [];
  const closeCode = (): void => {
    if (codeLanguage === null) return;
    items.push({
      kind: "code",
      language: codeLanguage.length > 0 ? codeLanguage : null,
      lines: codeLines,
    });
    codeLanguage = null;
    codeLines = [];
  };
  for (const line of lines) {
    if (line.startsWith("```")) {
      if (codeLanguage === null) codeLanguage = line.slice(3).trim();
      else closeCode();
      continue;
    }
    if (codeLanguage !== null) {
      codeLines.push(line);
      continue;
    }
    items.push(line.trim().length === 0 ? { kind: "blank" } : { kind: "paragraph", text: line });
  }
  closeCode();
  return items;
}

function formatFocusTarget(target: Readonly<TargetStoreEntry>, cwd: string): string {
  const relPath = path.relative(cwd, target.file) || target.file;
  return `${relPath}:${target.displayLine}:${target.displayCharacter}`;
}

function buildNextQueries(
  target: Readonly<TargetStoreEntry> | null | undefined,
  cwd: string,
): string[] {
  if (!target) return ["Use `code_orientation` for a neutral orientation summary."];

  const relPath = path.relative(cwd, target.file) || target.file;
  return [
    `\`code_graph\` with \`target: { anchor: { file: "${relPath}", line: ${target.displayLine}, character: ${target.displayCharacter} } }\` for relation follow-up`,
  ];
}

function buildReadNextGuidance(
  target: Readonly<TargetStoreEntry> | null | undefined,
  treeContext: Awaited<ReturnType<typeof maybeGatherTreeContext>>,
  cwd: string,
): ReadNextItem[] {
  if (!target) return [];
  const relPath = path.relative(cwd, target.file) || target.file;
  const enclosing = findEnclosingOutlineItem(target, treeContext);
  if (enclosing) {
    return [readNextEnclosingScope(relPath, enclosing, target.displayLine)];
  }
  return [readNextTarget(relPath, target.displayLine, "inspect the target implementation")];
}

function findEnclosingOutlineItem(
  target: Readonly<TargetStoreEntry>,
  treeContext: Awaited<ReturnType<typeof maybeGatherTreeContext>>,
): { name: string; kind: string; startLine: number; endLine: number } | null {
  if (!treeContext || treeContext.outline.length === 0) return null;
  const candidates = treeContext.outline.filter(
    (item) => item.startLine <= target.displayLine && item.endLine >= target.displayLine,
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
  section: OrientationSectionData;
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
      status: collection.status,
      reason: collection.reason,
      confidence,
      provenance,
      evidenceLists: collection.evidenceLists,
      items: collection.items,
    },
    hasStructuralEvidence: collection.hasStructuralEvidence,
    hasSemanticEvidence: collection.hasSemanticEvidence,
  };
}

function hasRenderableItems(items: readonly OrientationItem[]): boolean {
  return items.some((item) => item.kind === "list-item");
}
