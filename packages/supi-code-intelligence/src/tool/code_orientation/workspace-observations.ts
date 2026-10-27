import * as path from "node:path";
import type { EvidencePartialReason } from "../../analysis/evidence.ts";
import type {
  ProjectDeclaration,
  WorkspaceCollection,
  WorkspaceObservation,
} from "../../analysis/workspace/types.ts";
import {
  type WorkspaceOrientationFacts,
  within,
} from "../../session/orientation/workspace-context.ts";

/** Focus-relative projects and individual memberships before either representation applies its limit. */
export function projectObservations(facts: WorkspaceOrientationFacts) {
  const { observation, focus } = facts;
  const root = focus ?? observation.root;
  const projects = observation.projects.filter(
    (project) => !focus || within(root, path.resolve(observation.root, project.directory)),
  );
  return {
    nested: projects.filter(
      (project) => path.resolve(observation.root, project.directory) !== root,
    ),
    focused: focus
      ? projects.filter((project) => path.resolve(observation.root, project.directory) === root)
      : [],
    memberships: projects.flatMap((project) =>
      project.memberships.map((membership) => ({ project, membership })),
    ),
  };
}

/** Group identical declared paths before applying a row limit. */
export function declaredPathObservations(project: ProjectDeclaration) {
  const byPath = new Map<string, string[]>();
  for (const entry of project.declaredPaths) {
    const fields = byPath.get(entry.path) ?? [];
    fields.push(entry.field);
    byPath.set(entry.path, fields);
  }
  return [...byPath]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([declared, fields]) => ({ path: declared, fields }));
}

/** Select manifest relationships for a focused project without inferring runtime topology. */
export function projectRelationships(
  observation: WorkspaceObservation,
  project: ProjectDeclaration,
) {
  return observation.relationships.filter(
    (edge) => edge.from === project.id || edge.to === project.id,
  );
}

/** Shared completeness policy for the captured inventory and parsed metadata. */
export function workspaceCollectionStatus(collection: WorkspaceCollection): {
  inventoryPartial: boolean;
  metadataPartial: boolean;
  partialReason: EvidencePartialReason;
  reason: string;
} {
  const inventoryPartial =
    collection.stopReason !== "complete" ||
    collection.errors.some((error) => error.stage === "inventory");
  return {
    inventoryPartial,
    metadataPartial: collection.status === "partial",
    partialReason:
      collection.stopReason === "entry-limit"
        ? "safety-limit"
        : collection.stopReason === "deadline"
          ? "timeout"
          : inventoryPartial
            ? "filesystem-error"
            : "configuration-error",
    reason: inventoryPartial
      ? "Inventory collection is incomplete"
      : "Metadata collection is incomplete",
  };
}
