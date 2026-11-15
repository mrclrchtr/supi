/** Shared bounded workspace observation used by overview and Orientation surfaces. */

import * as path from "node:path";
import { readCMakeDocument } from "./cmake.ts";
import { readGoDocument } from "./go.ts";
import { collectInventory, DEFAULT_MAX_INVENTORY_ENTRIES } from "./inventory.ts";
import { readMavenDocument } from "./maven.ts";
import { applyMemberships } from "./membership.ts";
import { readMetadataDocuments } from "./metadata.ts";
import type { DocumentContribution, ParsedDocument } from "./metadata-types.ts";
import { readNodeDocument } from "./node.ts";
import { compareObservationPaths, isWithinRoot, relativeToRoot } from "./paths.ts";
import { readPythonDocument } from "./python.ts";
import { buildRelationships } from "./relationships.ts";
import { readRustDocument } from "./rust.ts";
import type {
  ObserveWorkspaceOptions,
  ProjectDeclaration,
  WorkspaceObservation,
  WorkspaceObservationError,
} from "./types.ts";

/**
 * Observe one exact working directory with bounded filesystem and metadata collection.
 *
 * The root is never widened to a Git or workspace ancestor. Git-ignored paths
 * stay excluded unless `includeIgnored` is true. Symbolic links are returned
 * as inventory entries but are never traversed or read through. Cancellation
 * throws the abort reason; an expired deadline produces a partial result.
 */
export async function observeWorkspace(
  cwd: string,
  options: ObserveWorkspaceOptions = {},
): Promise<WorkspaceObservation> {
  const root = path.resolve(cwd);
  const control = options.control;
  control?.signal?.throwIfAborted();
  const exclude = options.exclude ? [...options.exclude] : [];
  const includeIgnored = options.includeIgnored === true;
  const maxEntries = effectiveLimit(options.maxEntries);
  const prioritizedDirectory = priorityDirectory(root, options.prioritizeDirectory);
  const inventory = await collectInventory(root, {
    exclude,
    includeIgnored,
    maxEntries,
    prioritizedDirectory,
    control,
  });
  control?.signal?.throwIfAborted();
  const metadataEntries = [...inventory.entries].sort((left, right) =>
    compareObservationPaths(left.path, right.path, prioritizedDirectory),
  );
  const metadata = await readMetadataDocuments(root, metadataEntries, control);
  control?.signal?.throwIfAborted();
  const contribution = collectContributions(metadata.parsed);
  const issues = [...metadata.issues, ...contribution.issues];
  const projects = applyMemberships(
    [...contribution.projects].sort((left, right) =>
      left.manifestPath.localeCompare(right.manifestPath),
    ),
    contribution.workspaces,
    issues,
  );
  const errors = [...inventory.errors, ...metadataErrors(issues)];
  if (metadata.deadlineReached) {
    errors.push({
      stage: "metadata",
      path: null,
      reason: "Metadata collection deadline reached.",
    });
  }
  const result: WorkspaceObservation = {
    root,
    inventory: { source: inventory.source, entries: inventory.entries },
    inclusion: {
      source: inventory.source,
      exclude,
      includeIgnored,
      symlinks: "not-followed",
      directoryNamesExcluded: false,
    },
    collection: {
      status:
        inventory.stopReason === "complete" && errors.length === 0 && issues.length === 0
          ? "complete"
          : "partial",
      stopReason: metadata.deadlineReached ? "deadline" : inventory.stopReason,
      prioritizedDirectory,
      limits: { maxEntries, deadline: finiteDeadline(control?.deadline) },
      errors,
    },
    metadata: { documents: metadata.documents, issues },
    projects,
    workspaces: contribution.workspaces,
    relationships: buildRelationships(projects),
  };
  return deepFreeze(result);
}

function priorityDirectory(root: string, value: string | undefined): string | null {
  if (value === undefined) return null;
  const target = path.resolve(root, value);
  if (!isWithinRoot(root, target))
    throw new Error("The prioritized directory must stay inside the observation root.");
  const relative = relativeToRoot(root, target);
  return relative === "." ? null : relative;
}

function collectContributions(documents: readonly ParsedDocument[]): {
  projects: ProjectDeclaration[];
  workspaces: NonNullable<DocumentContribution["workspace"]>[];
  issues: DocumentContribution["issues"][number][];
} {
  const projects: ProjectDeclaration[] = [];
  const workspaces: NonNullable<DocumentContribution["workspace"]>[] = [];
  const issues: DocumentContribution["issues"][number][] = [];
  for (const document of documents) {
    const contribution = readDocument(document);
    if (contribution.project) projects.push(contribution.project);
    if (contribution.workspace) workspaces.push(contribution.workspace);
    issues.push(...contribution.issues);
  }
  return { projects, workspaces, issues };
}

function readDocument(document: ParsedDocument): DocumentContribution {
  switch (document.kind) {
    case "package-json":
    case "pnpm-workspace":
      return readNodeDocument(document);
    case "pyproject":
      return readPythonDocument(document);
    case "cargo":
      return readRustDocument(document);
    case "go-mod":
    case "go-work":
      return readGoDocument(document);
    case "maven-pom":
      return readMavenDocument(document);
    case "cmake-lists":
      return readCMakeDocument(document);
  }
}

function metadataErrors(
  issues: WorkspaceObservation["metadata"]["issues"],
): WorkspaceObservationError[] {
  return issues
    .filter((entry) => entry.kind === "malformed" || entry.kind === "unreadable")
    .map((entry) => ({ stage: "metadata", path: entry.path, reason: entry.reason }));
}

function effectiveLimit(value: number | undefined): number {
  const requested = value ?? DEFAULT_MAX_INVENTORY_ENTRIES;
  if (!Number.isFinite(requested)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.floor(requested));
}

function finiteDeadline(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}
