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

/** Keep the immediate directory map and all collection problems inline; defer ancillary facts. */
export function selectDirectoryNavigation(data: OrientationResultData): OrientationResultData {
  if (!data.workspace?.focus || data.workspace.overview) return data;
  const workspaceRoot = data.workspace.focus === data.workspace.observation.root;
  const inline = (section: OrientationSectionData): boolean =>
    INLINE_SECTIONS.has(section.key) ||
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
  if (total > 0) {
    sections.push({
      key: "workspace.captured",
      title: "Captured navigation",
      status: "complete",
      reason: null,
      confidence: "unavailable",
      provenance: [],
      evidenceLists: [
        {
          key: "workspace.captured",
          totalCount: total,
          shownCount: 0,
          omittedCount: total,
          partialReason: null,
        },
      ],
      items: [
        {
          kind: "paragraph",
          text: `Ancillary sections are in the captured details: ${deferred.map((section) => section.title).join("; ")}.`,
        },
      ],
    });
  }
  return {
    ...data,
    sections,
    renderedSections: sections.map((section) => section.key),
    omittedCount: sections.reduce(
      (sum, section) =>
        sum + section.evidenceLists.reduce((count, list) => count + (list.omittedCount ?? 0), 0),
      0,
    ),
  };
}
