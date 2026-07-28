/** Direct package-manifest and workspace-configuration collection for Orientation. */

import { glob } from "node:fs/promises";
import * as path from "node:path";
import {
  errorMessage,
  readPackageJson,
  toModuleInfo,
  toRootManifestObservation,
} from "./manifest.ts";
import type {
  ArchitectureModel,
  ArchitectureObservationStatus,
  DependencyEdge,
  ModuleInfo,
  PackageManifestObservation,
  WorkspaceTopology,
} from "./model.ts";
import { findArchitectureRoot, readWorkspaceDeclaration } from "./workspace-config.ts";

interface WorkspaceCollection {
  readonly modules: readonly ModuleInfo[];
  readonly edges: readonly DependencyEdge[];
  readonly status: ArchitectureObservationStatus;
  readonly reason: string | null;
  readonly failedPackageManifestCount: number;
}

/**
 * Collect directly observed package-manifest and workspace-configuration facts.
 *
 * Only `package.json#workspaces` and `pnpm-workspace.yaml#packages` establish
 * workspace membership. Pattern expansion uses Node's native glob after
 * documented pattern validation; unsupported patterns fail closed.
 */
export async function buildArchitectureModel(cwd: string): Promise<ArchitectureModel> {
  const root = findArchitectureRoot(cwd);
  const rootRead = readPackageJson(root);
  const rootPackage =
    rootRead.kind === "complete" ? toModuleInfo(rootRead.value, root, root) : null;
  const rootManifest = toRootManifestObservation(rootRead, rootPackage);
  const declaration = readWorkspaceDeclaration(root, rootRead);

  if (declaration.kind === "unavailable") {
    return createModel({
      root,
      rootManifest,
      topology: {
        kind: "unavailable",
        status: "unavailable",
        source: null,
        reason: declaration.reason,
        failedPackageManifestCount: 0,
      },
    });
  }

  if (declaration.kind === "single-package") {
    return rootPackage
      ? createModel({
          root,
          rootManifest,
          topology: {
            kind: "single-package",
            status: "complete",
            source: null,
            reason: null,
            failedPackageManifestCount: 0,
          },
          modules: [rootPackage],
        })
      : createModel({
          root,
          rootManifest,
          topology: {
            kind: "unavailable",
            status: "unavailable",
            source: null,
            reason: rootManifest.reason ?? "Root package manifest is unavailable.",
            failedPackageManifestCount: 0,
          },
        });
  }

  const collected = await collectWorkspaceModules(root, declaration.patterns);
  return createModel({
    root,
    rootManifest,
    topology: {
      kind: collected.status === "unavailable" ? "unavailable" : "workspace",
      status: collected.status,
      source: declaration.source,
      reason: collected.reason,
      failedPackageManifestCount: collected.failedPackageManifestCount,
    },
    modules: collected.modules,
    edges: collected.edges,
  });
}

function createModel(input: {
  root: string;
  rootManifest: PackageManifestObservation;
  topology: WorkspaceTopology;
  modules?: readonly ModuleInfo[];
  edges?: readonly DependencyEdge[];
}): ArchitectureModel {
  return {
    root: input.root,
    rootManifest: input.rootManifest,
    topology: input.topology,
    modules: input.modules ?? [],
    edges: input.edges ?? [],
    name: input.rootManifest.package?.name ?? null,
    description: input.rootManifest.package?.description ?? null,
  };
}

async function collectWorkspaceModules(
  root: string,
  patterns: readonly string[],
): Promise<WorkspaceCollection> {
  let directories: string[];
  try {
    directories = await collectWorkspaceDirectories(root, patterns);
  } catch (error) {
    return unavailableCollection(`Could not expand workspace patterns: ${errorMessage(error)}`);
  }

  const result = collectPackageManifests(root, directories);
  const relationships = collectManifestRelationships(result.modules);
  const reasons = [
    result.failedPackageManifestCount > 0
      ? `${result.failedPackageManifestCount} matched package manifest${result.failedPackageManifestCount === 1 ? " is" : "s are"} unreadable or invalid`
      : null,
    relationships.duplicateNames.length > 0
      ? `duplicate package names: ${relationships.duplicateNames.join(", ")}`
      : null,
  ].filter((reason): reason is string => reason !== null);

  return {
    modules: result.modules,
    edges: relationships.edges,
    status: reasons.length > 0 ? "partial" : "complete",
    reason: reasons.length > 0 ? reasons.join("; ") : null,
    failedPackageManifestCount: result.failedPackageManifestCount,
  };
}

/** Expand validated inclusion patterns and trailing exclusions with Node's native glob. */
async function collectWorkspaceDirectories(
  root: string,
  patterns: readonly string[],
): Promise<string[]> {
  const inclusions = patterns.filter((pattern) => !pattern.startsWith("!"));
  const exclusions = [
    "**/node_modules/**",
    "**/.pnpm/**",
    "**/.git/**",
    ...patterns.filter((pattern) => pattern.startsWith("!")).map((pattern) => pattern.slice(1)),
  ];
  const directories = new Set<string>();
  for await (const entry of glob(inclusions, {
    cwd: root,
    exclude: exclusions,
    withFileTypes: true,
  })) {
    if (entry.isDirectory()) directories.add(path.join(entry.parentPath, entry.name));
  }
  return [...directories];
}

function collectPackageManifests(root: string, directories: readonly string[]) {
  const byDirectory = new Map<string, ModuleInfo>();
  let failedPackageManifestCount = 0;
  for (const directory of sortedDirectories(directories)) {
    const manifest = readPackageJson(directory);
    if (manifest.kind === "missing") continue;
    if (manifest.kind === "unavailable") {
      failedPackageManifestCount++;
      continue;
    }
    byDirectory.set(directory, toModuleInfo(manifest.value, directory, root));
  }
  return {
    modules: [...byDirectory.values()].sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    ),
    failedPackageManifestCount,
  };
}

function sortedDirectories(directories: readonly string[]): string[] {
  return directories
    .map((entry) => path.resolve(entry))
    .sort((left, right) => left.localeCompare(right));
}

function collectManifestRelationships(modules: readonly ModuleInfo[]) {
  const byName = indexModulesByName(modules);
  const duplicateNames = [...byName.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([name]) => name)
    .sort((left, right) => left.localeCompare(right));
  return { edges: collectEdges(modules, byName), duplicateNames };
}

function indexModulesByName(modules: readonly ModuleInfo[]): Map<string, ModuleInfo[]> {
  const byName = new Map<string, ModuleInfo[]>();
  for (const module of modules) {
    if (!module.name) continue;
    const entries = byName.get(module.name) ?? [];
    entries.push(module);
    byName.set(module.name, entries);
  }
  return byName;
}

function collectEdges(
  modules: readonly ModuleInfo[],
  byName: ReadonlyMap<string, readonly ModuleInfo[]>,
): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  for (const module of modules) {
    if (!module.name) continue;
    for (const section of module.dependencySections) {
      for (const dependency of section.entries) {
        if ((byName.get(dependency.name)?.length ?? 0) !== 1) continue;
        edges.push({
          from: module.name,
          to: dependency.name,
          field: section.field,
          specifier: dependency.specifier,
          manifestPath: module.manifestPath,
        });
      }
    }
  }
  return edges.sort(
    (left, right) =>
      left.from.localeCompare(right.from) ||
      left.to.localeCompare(right.to) ||
      left.field.localeCompare(right.field),
  );
}

function unavailableCollection(reason: string): WorkspaceCollection {
  return {
    modules: [],
    edges: [],
    status: "unavailable",
    reason,
    failedPackageManifestCount: 0,
  };
}
