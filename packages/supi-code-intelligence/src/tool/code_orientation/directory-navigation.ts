import type {
  OrientationResultData,
  OrientationSectionData,
} from "../../session/orientation-types.ts";

const INLINE_SECTIONS = new Set([
  "instructions",
  "workspace.directories",
  "workspace.files",
  "workspace.issues",
]);

/**
 * Keep the immediate directory map, manifest-declared entry paths, and all collection problems
 * inline; defer ancillary facts to the captured result and name them in one note.
 */
export function selectDirectoryNavigation(data: OrientationResultData): OrientationResultData {
  if (!data.workspace?.focus || data.workspace.overview) return data;
  const workspaceRoot = data.workspace.focus === data.workspace.observation.root;
  const inline = (section: OrientationSectionData): boolean =>
    INLINE_SECTIONS.has(section.key) ||
    section.key.endsWith(".paths") ||
    section.key.startsWith("gradle.") ||
    (workspaceRoot &&
      (section.key === "workspace.projects" || section.key === "workspace.memberships")) ||
    section.status !== "complete" ||
    section.evidenceLists.some((list) => list.totalCount === null || list.partialReason !== null);
  const sections = data.sections.filter(inline);
  const deferred = data.sections.filter((section) => !inline(section));
  const total = deferred.reduce(
    (sum, section) =>
      sum + section.evidenceLists.reduce((count, list) => count + (list.totalCount ?? 0), 0),
    0,
  );
  const notes =
    total > 0
      ? [
          ...data.notes,
          `Deferred to captured details: ${deferred.map((section) => section.title).join("; ")}.`,
        ]
      : data.notes;
  return {
    ...data,
    notes,
    sections,
    renderedSections: sections.map((section) => section.key),
    omittedCount:
      total +
      sections.reduce(
        (sum, section) =>
          sum + section.evidenceLists.reduce((count, list) => count + (list.omittedCount ?? 0), 0),
        0,
      ),
  };
}
