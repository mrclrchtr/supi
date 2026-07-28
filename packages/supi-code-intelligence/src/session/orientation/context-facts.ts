import { readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import type { WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import type { ArchitectureModel, ModuleInfo } from "../../analysis/architecture/model.ts";
import {
  findModuleForPath,
  getDependencies,
  getDependents,
} from "../../analysis/architecture/model.ts";
import { gatherBriefEnrichment } from "../../analysis/brief/enrich.ts";
import {
  collectDirectoryInventory,
  inventoryExtensionLabel,
} from "../../analysis/brief/inventory.ts";
import { listSourceFiles, summarizeDirectoryRecursively } from "../../analysis/brief/summarize.ts";
import type { CodeProvider } from "../../analysis/provider.ts";
import type { OrientationBlock, OrientationResultData } from "../orientation-types.ts";
import { collectPrioritySignalBlocks } from "./context-signals.ts";

interface ContextFactsInput {
  readonly model: ArchitectureModel | null;
  readonly cwd: string;
  readonly focus?: string;
  readonly maxResults: number;
  readonly provider: CodeProvider | null;
  readonly lspRuntime: WorkspaceLspRuntimeState;
}

/** Collect presentation-neutral workspace/path Orientation facts directly from analysis data. */
export async function collectContextOrientationFacts(
  input: ContextFactsInput,
): Promise<OrientationResultData> {
  if (!input.model) return noModelFacts(input.focus);
  if (!input.focus) return collectProjectFacts(input);

  const stat = statSync(input.focus);
  return stat.isDirectory() ? collectDirectoryFacts(input) : collectFileFacts(input);
}

function collectProjectFacts(input: ContextFactsInput): OrientationResultData {
  const model = input.model as ArchitectureModel;
  const blocks: OrientationBlock[] = [heading(1, "Project Brief"), blank()];
  if (model.name) {
    blocks.push(
      paragraph(`**${model.name}**${model.description ? ` — ${model.description}` : ""}`),
      blank(),
    );
  }
  blocks.push(
    ...collectPrioritySignalBlocks(
      model.root,
      summarizeDirectoryRecursively(model.root).allFiles,
      input.lspRuntime,
    ),
  );

  if (model.modules.length === 0) {
    blocks.push(
      paragraph(
        "No structured modules detected. This appears to be a minimal or source-only project.",
      ),
    );
  } else {
    blocks.push(heading(2, "Modules"), blank());
    for (const module of model.modules) appendProjectModule(blocks, model, module);
    appendDependencyGraph(blocks, model);
  }

  const startHere = model.modules
    .map((module) => ({ module, dependentCount: getDependents(model, module.name).length }))
    .filter(({ dependentCount }) => dependentCount >= 2)
    .sort((left, right) => right.dependentCount - left.dependentCount)
    .slice(0, 3)
    .map(({ module, dependentCount }) => ({
      target: `${shortName(module)} (${module.relativePath})`,
      reason: `core dependency used by ${dependentCount} modules`,
    }));
  if (startHere.length > 0) {
    blocks.push(heading(2, "Start Here"), blank());
    for (const item of startHere) blocks.push(listItem(`**${item.target}** — ${item.reason}`));
    blocks.push(blank());
  }

  const firstModule = model.modules[0];
  const nextQueries = firstModule
    ? [`Use code_orientation with focus.module "${firstModule.name}" for a focused module brief`]
    : [];
  return resultData({
    blocks,
    confidence: "structural",
    focusTarget: null,
    nextQueries,
  });
}

function appendProjectModule(
  blocks: OrientationBlock[],
  model: ArchitectureModel,
  module: ModuleInfo,
): void {
  blocks.push(heading(3, shortName(module)));
  if (module.description) blocks.push(paragraph(module.description));
  blocks.push(listItem(`Path: \`${module.relativePath}\``));
  if (module.entrypoints.length > 0) {
    blocks.push(
      listItem(`Entrypoints: ${module.entrypoints.map((entry) => `\`${entry}\``).join(", ")}`),
    );
  }
  if (module.internalDeps.length > 0) {
    blocks.push(listItem(`Dependencies: ${module.internalDeps.map(stripScope).join(", ")}`));
  }
  const dependentCount = getDependents(model, module.name).length;
  if (dependentCount > 0)
    blocks.push(listItem(`Dependents: ${dependentCount} module${dependentCount === 1 ? "" : "s"}`));
  if (module.isLeaf) blocks.push(listItem("_(leaf — no internal dependents)_"));
  blocks.push(blank());
}

function appendDependencyGraph(blocks: OrientationBlock[], model: ArchitectureModel): void {
  if (model.edges.length === 0) return;
  blocks.push(heading(2, "Dependency Graph"), blank());
  for (const edge of model.edges.slice(0, 15)) {
    blocks.push(listItem(`${stripScope(edge.from)} → ${stripScope(edge.to)}`));
  }
  if (model.edges.length > 15)
    blocks.push(listItem(`_+${model.edges.length - 15} more edges omitted_`));
  blocks.push(blank());
}

async function collectDirectoryFacts(input: ContextFactsInput): Promise<OrientationResultData> {
  const model = input.model as ArchitectureModel;
  const module = findModuleForPath(model, input.focus as string);
  const isModuleRoot = module?.root === input.focus;
  const blocks: OrientationBlock[] = [];
  const nextQueries: string[] = [];

  if (module && isModuleRoot) {
    appendModuleDirectoryFacts(blocks, model, module, input.maxResults);
    if (module.entrypoints[0]) {
      nextQueries.push(
        `Use code_orientation with focus.path "${module.relativePath}/${module.entrypoints[0].replace(/^\.\//, "")}" for entrypoint details`,
      );
    }
  } else {
    appendNestedDirectoryFacts({
      blocks,
      model,
      module,
      focus: input.focus as string,
      maxResults: input.maxResults,
    });
    const relPath = path.relative(model.root, input.focus as string);
    nextQueries.push(
      `Use code_find with an explicit query and scope ["${relPath}"] for nested evidence`,
    );
  }
  blocks.push(
    ...collectPrioritySignalBlocks(
      model.root,
      summarizeDirectoryRecursively(input.focus as string).allFiles,
      input.lspRuntime,
    ),
  );

  return resultData({
    blocks,
    confidence: "structural",
    focusTarget: path.relative(input.cwd, input.focus as string) || ".",
    nextQueries,
  });
}

function appendModuleDirectoryFacts(
  blocks: OrientationBlock[],
  model: ArchitectureModel,
  module: ModuleInfo,
  maxResults: number,
): void {
  blocks.push(heading(1, `Module: ${shortName(module)}`));
  if (module.description) blocks.push(blank(), paragraph(module.description));
  blocks.push(blank(), listItem(`Path: \`${module.relativePath}\``));
  if (module.entrypoints.length > 0) {
    blocks.push(
      listItem(`Entrypoints: ${module.entrypoints.map((entry) => `\`${entry}\``).join(", ")}`),
    );
  }
  const dependencies = getDependencies(model, module.name);
  appendModuleLinks(blocks, "Dependencies (internal)", dependencies);
  if (module.externalDeps.length > 0) {
    blocks.push(blank(), heading(2, "Dependencies (external)"));
    for (const dependency of module.externalDeps.slice(0, 8)) blocks.push(listItem(dependency));
  }
  appendModuleLinks(blocks, "Dependents", getDependents(model, module.name));
  const files = listSourceFiles(module.root);
  blocks.push(blank(), heading(2, "Source Files"));
  for (const file of files.slice(0, maxResults)) blocks.push(listItem(`\`${file}\``));
  if (files.length > maxResults)
    blocks.push(listItem(`_+${files.length - maxResults} more files_`));
  appendInventoryFacts(blocks, module.root);
  blocks.push(blank());
}

function appendModuleLinks(
  blocks: OrientationBlock[],
  title: string,
  modules: readonly ModuleInfo[],
): void {
  if (modules.length === 0) return;
  blocks.push(blank(), heading(2, title));
  for (const module of modules) {
    blocks.push(listItem(`${shortName(module)} (\`${module.relativePath}\`)`));
  }
}

function appendNestedDirectoryFacts(options: {
  blocks: OrientationBlock[];
  model: ArchitectureModel;
  module: ModuleInfo | null;
  focus: string;
  maxResults: number;
}): void {
  const { blocks, model, module, focus, maxResults } = options;
  const relPath = path.relative(model.root, focus);
  blocks.push(heading(1, `Directory: ${relPath || "."}`), blank());
  if (module)
    blocks.push(
      paragraph(`_Inside module: ${shortName(module)} (\`${module.relativePath}\`)_`),
      blank(),
    );
  const summary = summarizeDirectoryRecursively(focus);
  if (summary.directFiles.length > 0) {
    blocks.push(heading(2, "Source Files"));
    for (const file of summary.directFiles.slice(0, maxResults))
      blocks.push(listItem(`\`${file}\``));
    blocks.push(blank());
  }
  if (summary.totalSourceFiles > 0) {
    blocks.push(
      heading(2, "Descendant Source Files"),
      listItem(`Total: ${summary.totalSourceFiles}`),
    );
    for (const directory of summary.subdirs.slice(0, 8)) {
      blocks.push(
        listItem(
          `\`${directory.name}/\` — ${directory.fileCount} file${directory.fileCount === 1 ? "" : "s"}`,
        ),
      );
    }
    blocks.push(blank());
  }
  if (summary.publicSurfaces.length > 0) {
    blocks.push(heading(2, "Public Surfaces"));
    for (const surface of summary.publicSurfaces.slice(0, 8)) {
      blocks.push(listItem(surface));
    }
    blocks.push(blank());
  }
  appendInventoryFacts(blocks, focus);
  if (summary.totalSourceFiles === 0)
    blocks.push(paragraph("No recognized source files in this directory."));
}

function appendInventoryFacts(blocks: OrientationBlock[], directory: string): void {
  const inventory = collectDirectoryInventory(directory);
  if (inventory.totalFiles === 0) return;
  blocks.push(paragraph(`**Files:** ${inventory.totalFiles} total`));
  const extensions = [...inventory.byExtension.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10);
  for (const [extension, count] of extensions) {
    blocks.push(listItem(`${inventoryExtensionLabel(extension)}: ${count}`));
  }
  if (inventory.landmarkFiles.length > 0) {
    blocks.push(blank(), paragraph("**Landmark files:**"));
    for (const file of [...new Set(inventory.landmarkFiles)]) blocks.push(listItem(`\`${file}\``));
  }
}

async function collectFileFacts(input: ContextFactsInput): Promise<OrientationResultData> {
  const model = input.model as ArchitectureModel;
  const focus = input.focus as string;
  const relPath = path.relative(model.root, focus);
  const module = findModuleForPath(model, focus);
  const lines = readFileSync(focus, "utf-8").split("\n").length;
  const enrichment = await gatherBriefEnrichment(
    input.provider,
    relPath,
    input.maxResults,
    input.lspRuntime,
  );
  const blocks: OrientationBlock[] = [
    heading(1, `File: ${relPath || path.basename(focus)}`),
    blank(),
  ];
  if (module)
    blocks.push(paragraph(`_Module: ${shortName(module)} (\`${module.relativePath}\`)_`), blank());
  blocks.push(listItem(`Lines: ${lines}`));
  appendFileEnrichment(blocks, enrichment);
  blocks.push(...collectPrioritySignalBlocks(model.root, [focus], input.lspRuntime));
  return resultData({
    blocks,
    confidence: "structural",
    focusTarget: path.relative(input.cwd, focus),
    nextQueries: [`Use code_inspect with an anchored point in "${relPath}" for exact facts`],
  });
}

function appendFileEnrichment(
  blocks: OrientationBlock[],
  enrichment: Awaited<ReturnType<typeof gatherBriefEnrichment>>,
): void {
  if (enrichment.outline.length > 0) {
    blocks.push(blank(), heading(2, "Outline"));
    for (const item of enrichment.outline)
      blocks.push(listItem(`\`${item.name}\` (${item.kind}, L${item.startLine}–L${item.endLine})`));
  }
  if (enrichment.imports.length > 0) {
    blocks.push(blank(), heading(2, "Imports"));
    for (const item of enrichment.imports) blocks.push(listItem(`\`${item.moduleSpecifier}\``));
  }
  if (enrichment.exports.length > 0) {
    blocks.push(blank(), heading(2, "Exports"));
    for (const item of enrichment.exports) blocks.push(listItem(`\`${item.name}\` (${item.kind})`));
  }
  if (enrichment.diagnostics.length > 0) {
    blocks.push(blank(), heading(2, "Diagnostics"));
    for (const diagnostic of enrichment.diagnostics) {
      blocks.push(
        listItem(
          `**${diagnostic.severity === 1 ? "ERROR" : "WARN"}** (L${diagnostic.line}): ${diagnostic.message}`,
        ),
      );
    }
  }
  blocks.push(blank());
}

function resultData(input: {
  blocks: OrientationBlock[];
  confidence: OrientationResultData["confidence"];
  focusTarget: string | null;
  nextQueries: string[];
}): OrientationResultData {
  return {
    blocks: input.blocks,
    confidence: input.confidence,
    focusTarget: input.focusTarget,
    requestedSections: [],
    renderedSections: ["orientation"],
    omittedCount: 0,
    nextQueries: input.nextQueries,
    readNext: [],
  };
}

function noModelFacts(focus: string | undefined): OrientationResultData {
  return resultData({
    blocks: [
      paragraph(
        "No project structure detected. This directory has no recognizable project metadata or source files.",
      ),
    ],
    confidence: "unavailable",
    focusTarget: focus ?? null,
    nextQueries: ["Add a package.json or pnpm-workspace.yaml to enable architecture analysis"],
  });
}

function heading(level: 1 | 2 | 3, text: string): OrientationBlock {
  return { kind: "heading", level, text };
}
function paragraph(text: string): OrientationBlock {
  return { kind: "paragraph", text };
}
function listItem(text: string): OrientationBlock {
  return { kind: "list-item", text };
}
function blank(): OrientationBlock {
  return { kind: "blank" };
}
function shortName(module: ModuleInfo): string {
  return stripScope(module.name);
}
function stripScope(name: string): string {
  return name.replace(/^@[^/]+\//, "");
}
