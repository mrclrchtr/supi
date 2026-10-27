import * as path from "node:path";
import type { ProjectDeclaration } from "../../analysis/workspace/types.ts";
import { within } from "../../session/orientation/workspace-context.ts";
import type { OrientationResultData } from "../../session/orientation-types.ts";
import {
  declaredPathObservations,
  projectObservations,
  projectRelationships,
  workspaceCollectionStatus,
} from "./workspace-observations.ts";
import { collectWorkspaceInventory, containingProjects } from "./workspace-sections.ts";

function project(project: ProjectDeclaration) {
  const { id, manifestPath, kind, directory, name, nameField, description, descriptionField } =
    project;
  return { id, manifestPath, kind, directory, name, nameField, description, descriptionField };
}

/** Select named workspace records using the caller's limit, never the text budget. */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: native lists and their independent selection counts are assembled together
export function workspaceFacts(data: OrientationResultData) {
  const facts = data.workspace;
  if (!facts) return undefined;
  const { observation, maxResults: limit } = facts;
  const root = facts.focus ?? observation.root;
  const entries = observation.inventory.entries
    .filter((entry) => within(root, path.resolve(observation.root, entry.path)))
    .map((entry) => ({
      path: path
        .relative(root, path.resolve(observation.root, entry.path))
        .replaceAll(path.sep, "/"),
      kind: entry.kind,
    }));
  const inventory = collectWorkspaceInventory(entries);
  const { nested, focused, memberships: observedMemberships } = projectObservations(facts);
  const memberships = observedMemberships.map(({ project: entry, membership }) => ({
    projectId: entry.id,
    kind: membership.kind,
    manifestPath: membership.manifestPath,
    field: membership.field,
    value: membership.value,
  }));
  const relationships = focused
    .flatMap((entry) => projectRelationships(observation, entry).slice(0, limit))
    .map(({ from, to, manifestPath, field, value }) => ({ from, to, manifestPath, field, value }));
  const { inclusion, collection, metadata } = observation;
  const gradle = observation.gradle;
  const pathGroups = focused.map((entry) => ({
    projectId: entry.id,
    paths: declaredPathObservations(entry),
  }));
  const { inventoryPartial, metadataPartial, partialReason } =
    workspaceCollectionStatus(collection);
  // These are counts of this native selection, not text-budget omissions.
  const selection = (key: string, total: number, incomplete = metadataPartial) => ({
    key,
    totalCount: incomplete ? null : total,
    shownCount: Math.min(limit, total),
    omittedCount: Math.max(0, total - limit),
    partialReason: incomplete ? partialReason : null,
  });
  return {
    root: observation.root,
    focus: root,
    directFiles: inventory.directFiles.slice(0, limit),
    directories: inventory.directories.slice(0, limit),
    extensions: inventory.extensions.slice(0, limit),
    containingProjects: containingProjects(facts, root).map(project),
    projects: nested.slice(0, limit).map(project),
    memberships: memberships.slice(0, limit),
    declaredPaths: pathGroups.map(({ projectId, paths }) => ({
      projectId,
      paths: paths.slice(0, limit),
    })),
    relationships,
    dependencies: focused.flatMap((entry) =>
      entry.dependencies
        .slice(0, limit)
        .map(({ field, name, value }) => ({ projectId: entry.id, field, name, value })),
    ),
    workspaceDeclarations: observation.workspaces
      .slice(0, limit)
      .map(({ kind, manifestPath, directory, field, patterns, excludeField, excludes }) => ({
        kind,
        manifestPath,
        directory,
        field,
        patterns: [...patterns],
        excludeField,
        excludes: [...excludes],
      })),
    inventory: {
      fileCount: entries.filter((entry) => entry.kind === "file").length,
      symlinkCount: entries.filter((entry) => entry.kind === "symlink").length,
      source: inclusion.source,
      exclude: [...inclusion.exclude],
      includeIgnored: inclusion.includeIgnored,
      symlinks: inclusion.symlinks,
      directoryNamesExcluded: inclusion.directoryNamesExcluded,
    },
    collection: {
      status: collection.status,
      stopReason: collection.stopReason,
      prioritizedDirectory: collection.prioritizedDirectory,
      limits: { maxEntries: collection.limits.maxEntries, deadline: collection.limits.deadline },
      errors: collection.errors
        .slice(0, limit)
        .map(({ stage, path: errorPath, reason }) => ({ stage, path: errorPath, reason })),
    },
    metadata: {
      documents: metadata.documents
        .slice(0, limit)
        .map(({ path: documentPath, kind, status, reason }) => ({
          path: documentPath,
          kind,
          status,
          reason,
        })),
      issues: metadata.issues.slice(0, limit).map(({ path: issuePath, field, kind, reason }) => ({
        path: issuePath,
        field,
        kind,
        reason,
      })),
    },
    selections: [
      selection("workspace.directories", inventory.directories.length, inventoryPartial),
      selection("workspace.files", inventory.directFiles.length, inventoryPartial),
      selection("workspace.extensions", inventory.extensions.length, inventoryPartial),
      selection("workspace.projects", nested.length),
      selection("workspace.memberships", memberships.length),
      selection("workspace.declarations", observation.workspaces.length),
      selection("workspace.collection.errors", collection.errors.length, false),
      selection("workspace.metadata.documents", metadata.documents.length),
      selection("workspace.metadata.issues", metadata.issues.length),
      ...pathGroups.map(({ projectId, paths }) => selection(`${projectId}.paths`, paths.length)),
      ...focused.map((entry) => selection(`${entry.id}.dependencies`, entry.dependencies.length)),
      ...focused.map((entry) =>
        selection(`${entry.id}.relationships`, projectRelationships(observation, entry).length),
      ),
      ...(gradle?.status === "complete"
        ? [
            selection("gradle.projects", gradle.projects.length, false),
            selection("gradle.included-builds", gradle.includedBuilds.length, false),
          ]
        : []),
    ],
    ...(gradle
      ? {
          gradle:
            gradle.status === "complete"
              ? {
                  selectedRoot: gradle.selectedRoot,
                  query: gradle.query,
                  status: gradle.status,
                  ...(gradle.runtime ? { runtime: gradleRuntime(gradle.runtime) } : {}),
                  gradleVersion: gradle.gradleVersion,
                  buildRoot: gradle.buildRoot,
                  projects: gradle.projects
                    .slice(0, limit)
                    .map(({ buildRoot, path: projectPath, name, directory, parentPath }) => ({
                      buildRoot,
                      path: projectPath,
                      name,
                      directory,
                      parentPath,
                    })),
                  includedBuilds: gradle.includedBuilds
                    .slice(0, limit)
                    .map(({ buildRoot }) => ({ buildRoot })),
                }
              : {
                  selectedRoot: gradle.selectedRoot,
                  query: gradle.query,
                  status: gradle.status,
                  ...(gradle.runtime ? { runtime: gradleRuntime(gradle.runtime) } : {}),
                  ...(gradle.gradleVersion ? { gradleVersion: gradle.gradleVersion } : {}),
                  stage: gradle.stage,
                  reason: gradle.reason,
                },
        }
      : {}),
  };
}

/** Distribution values may include credentials; expose only runtime provenance. */
function gradleRuntime(runtime: import("../../analysis/gradle/types.ts").GradleRuntime) {
  return {
    kind: runtime.kind,
    source: runtime.source,
    version: runtime.version,
  };
}
