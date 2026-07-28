import { statSync } from "node:fs";
import * as path from "node:path";
import type { WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import type {
  ArchitectureModel,
  DependencyEdge,
  ManifestDependencySection,
  ModuleInfo,
} from "../../analysis/architecture/model.ts";
import { findModuleForPath } from "../../analysis/architecture/model.ts";
import type { EvidencePartialReason } from "../../analysis/evidence.ts";
import type { CodeProvider } from "../../analysis/provider.ts";
import type { OrientationProvenance, OrientationResultData } from "../orientation-types.ts";
import {
  appendDirectoryEntries,
  appendList,
  appendPrioritySignals,
  appendStructuralFileFacts,
  appendUnavailable,
  type ContextOrientationBuilder,
  createBuilder,
  displayPath,
  filesystemProvenance,
  formatManifestValue,
  resultData,
} from "./context-sections.ts";

interface ContextFactsInput {
  readonly model: ArchitectureModel;
  readonly cwd: string;
  readonly focus?: string;
  readonly maxResults: number;
  readonly provider: CodeProvider | null;
  readonly lspRuntime: WorkspaceLspRuntimeState;
}

/** Collect direct filesystem, parsed-manifest, and explicit-provider Orientation facts. */
export async function collectContextOrientationFacts(
  input: ContextFactsInput,
): Promise<OrientationResultData> {
  if (!input.focus) return collectWorkspaceFacts(input);

  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(input.focus);
  } catch (error) {
    const builder = createBuilder(input.maxResults, `Path: ${displayPath(input.cwd, input.focus)}`);
    appendUnavailable(builder, {
      key: "filesystem.path",
      title: "Focused path",
      reason: String(error),
      provenance: [filesystemProvenance(input.cwd, input.focus)],
    });
    return resultData(builder, input.focus, []);
  }

  if (stat.isDirectory()) return collectDirectoryFacts(input);
  if (stat.isFile()) return collectFileFacts(input, stat.size);

  const builder = createBuilder(input.maxResults, `Path: ${displayPath(input.cwd, input.focus)}`);
  appendUnavailable(builder, {
    key: "filesystem.path",
    title: "Focused path",
    reason: "Orientation supports regular files and directories only.",
    provenance: [filesystemProvenance(input.cwd, input.focus)],
  });
  return resultData(builder, input.focus, []);
}

function collectWorkspaceFacts(input: ContextFactsInput): OrientationResultData {
  const { model } = input;
  const builder = createBuilder(input.maxResults, "Workspace Orientation");
  appendRootPackageFacts(builder, model);
  appendTopologyFacts(builder, model);
  appendDirectoryEntries(builder, model.root, input.cwd);
  appendPrioritySignals(builder, {
    scope: model.root,
    isFile: false,
    cwd: input.cwd,
    lspRuntime: input.lspRuntime,
  });
  return resultData(builder, null, []);
}

function collectDirectoryFacts(input: ContextFactsInput): OrientationResultData {
  const focus = input.focus as string;
  const builder = createBuilder(input.maxResults, `Directory: ${displayPath(input.cwd, focus)}`);
  appendDirectoryEntries(builder, focus, input.cwd);
  appendTopologyWarning(builder, input.model);
  appendPackageContext(builder, input.model, focus);
  appendPrioritySignals(builder, {
    scope: focus,
    isFile: false,
    cwd: input.cwd,
    lspRuntime: input.lspRuntime,
  });
  return resultData(builder, focus, [
    `Use code_find with an explicit query and scope ["${displayPath(input.cwd, focus)}"] for deeper structural evidence`,
  ]);
}

async function collectFileFacts(
  input: ContextFactsInput,
  byteSize: number,
): Promise<OrientationResultData> {
  const focus = input.focus as string;
  const builder = createBuilder(input.maxResults, `File: ${displayPath(input.cwd, focus)}`);
  appendList(builder, {
    key: "filesystem.file",
    title: "Filesystem facts",
    items: [`Size: ${byteSize} bytes`],
    render: (item) => item,
    confidence: "unavailable",
    provenance: [filesystemProvenance(input.cwd, focus)],
  });
  appendTopologyWarning(builder, input.model);
  appendPackageContext(builder, input.model, focus);
  await appendStructuralFileFacts(builder, input.provider, focus);
  appendPrioritySignals(builder, {
    scope: focus,
    isFile: true,
    cwd: input.cwd,
    lspRuntime: input.lspRuntime,
  });
  return resultData(builder, focus, [
    `Use code_inspect with an anchored point in "${displayPath(input.cwd, focus)}" for exact point facts`,
  ]);
}

function appendRootPackageFacts(
  builder: ContextOrientationBuilder,
  model: ArchitectureModel,
): void {
  const root = model.rootManifest;
  if (!root.package) {
    appendUnavailable(builder, {
      key: "manifest.root",
      title: "Root package manifest",
      reason: root.reason ?? "Unavailable.",
      provenance: [{ source: "manifest", detail: root.path }],
    });
    return;
  }
  appendPackageFacts(builder, root.package, "Root package manifest");
}

function appendTopologyFacts(builder: ContextOrientationBuilder, model: ArchitectureModel): void {
  const { topology } = model;
  if (topology.kind === "unavailable") {
    appendUnavailable(builder, {
      key: "topology",
      title: "Package topology",
      reason: topology.reason ?? "Unavailable.",
      provenance: [topologyProvenance(topology.source)],
    });
    return;
  }
  if (topology.kind === "single-package") return;

  const status = topology.status === "partial" ? "partial" : "complete";
  const partialReason = topologyPartialReason(model);
  appendList(builder, {
    key: "topology.packages",
    title: "Configuration-declared packages",
    items: model.modules,
    render: packageLabel,
    confidence: "unavailable",
    provenance: [topologyProvenance(topology.source)],
    status,
    reason: topology.reason,
    unknownRemainder: topology.failedPackageManifestCount > 0,
    partialReason,
  });
  appendRelationshipFacts(builder, {
    edges: model.edges,
    status,
    reason: topology.reason,
    partialReason,
  });
}

function appendTopologyWarning(builder: ContextOrientationBuilder, model: ArchitectureModel): void {
  if (model.topology.kind === "unavailable") {
    appendTopologyFacts(builder, model);
    return;
  }
  if (model.topology.status !== "partial") return;
  appendList(builder, {
    key: "topology",
    title: "Package topology",
    items: [],
    render: () => "",
    confidence: "unavailable",
    provenance: [topologyProvenance(model.topology.source)],
    status: "partial",
    reason: model.topology.reason,
    unknownRemainder: true,
    partialReason: topologyPartialReason(model),
  });
}

function appendPackageContext(
  builder: ContextOrientationBuilder,
  model: ArchitectureModel,
  focus: string,
): void {
  const module = findModuleForPath(model, focus);
  if (!module) return;

  if (path.resolve(module.root) === path.resolve(focus)) {
    appendPackageFacts(builder, module, "Package manifest");
    appendRelationshipFacts(builder, {
      edges: model.edges.filter((edge) => edge.from === module.name || edge.to === module.name),
      status: model.topology.status,
      reason: model.topology.reason,
      partialReason: topologyPartialReason(model),
    });
    return;
  }

  appendList(builder, {
    key: "package.containing",
    title: "Containing package",
    items: [module],
    render: packageLabel,
    confidence: "unavailable",
    provenance: [{ source: "manifest", detail: module.manifestPath }],
  });
}

function appendPackageFacts(
  builder: ContextOrientationBuilder,
  module: ModuleInfo,
  title: string,
): void {
  const identity = [`Manifest: \`${module.manifestPath}\``];
  if (module.name) identity.push(`name: \`${module.name}\``);
  if (module.description) identity.push(`description: ${module.description}`);
  appendList(builder, {
    key: `${module.manifestPath}.identity`,
    title,
    items: identity,
    render: (item) => item,
    confidence: "unavailable",
    provenance: [{ source: "manifest", detail: module.manifestPath }],
  });

  if (module.fields.length > 0) {
    appendList(builder, {
      key: `${module.manifestPath}.fields`,
      title: "Manifest declarations",
      items: module.fields,
      render: (field) => `\`${field.field}\`: ${formatManifestValue(field.value)}`,
      confidence: "unavailable",
      provenance: [{ source: "manifest", detail: module.manifestPath }],
    });
  }
  for (const section of module.dependencySections) {
    appendDependencySection(builder, module, section);
  }
}

function appendDependencySection(
  builder: ContextOrientationBuilder,
  module: ModuleInfo,
  section: ManifestDependencySection,
): void {
  appendList(builder, {
    key: `${module.manifestPath}.${section.field}`,
    title: `Manifest ${section.field}`,
    items: section.entries,
    render: (dependency) => `\`${dependency.name}\`: ${formatManifestValue(dependency.specifier)}`,
    confidence: "unavailable",
    provenance: [{ source: "manifest", detail: `${module.manifestPath}#${section.field}` }],
  });
}

function appendRelationshipFacts(
  builder: ContextOrientationBuilder,
  input: {
    edges: readonly DependencyEdge[];
    status: "complete" | "partial" | "unavailable";
    reason: string | null;
    partialReason: EvidencePartialReason | undefined;
  },
): void {
  if (input.status === "unavailable") return;
  appendList(builder, {
    key: "topology.relationships",
    title: "Manifest-declared package relationships",
    items: input.edges,
    render: (edge) =>
      `\`${edge.from}\` → \`${edge.to}\` — \`${edge.manifestPath}#${edge.field}\`: ${formatManifestValue(edge.specifier)}`,
    confidence: "unavailable",
    provenance: [{ source: "manifest", detail: "package dependency fields" }],
    status: input.status,
    reason: input.reason,
    unknownRemainder: input.status === "partial",
    partialReason: input.partialReason,
  });
}

function topologyPartialReason(model: ArchitectureModel): EvidencePartialReason | undefined {
  if (model.topology.status !== "partial") return undefined;
  return model.topology.failedPackageManifestCount > 0 ? "filesystem-error" : "configuration-error";
}

function topologyProvenance(
  source: ArchitectureModel["topology"]["source"],
): OrientationProvenance {
  return source
    ? { source: "configuration", detail: `${source.path}#${source.field}` }
    : { source: "configuration", detail: "supported workspace metadata" };
}

function packageLabel(module: ModuleInfo): string {
  const name = module.name ? `\`${module.name}\`` : "Unnamed package manifest";
  return `${name} — \`${module.relativePath}\` (\`${module.manifestPath}\`)`;
}
