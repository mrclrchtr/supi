import * as path from "node:path";
import type { InventoryEntry, WorkspaceObservation } from "../../analysis/workspace/types.ts";
import {
  type WorkspaceOrientationFacts,
  within,
} from "../../session/orientation/workspace-context.ts";
import type {
  OrientationResultData,
  OrientationSectionData,
} from "../../session/orientation-types.ts";
import { gradleSections } from "./gradle-sections.ts";
import { code, plain, sourcePath, tableSection } from "./workspace-format.ts";
import { workspaceCollectionStatus } from "./workspace-observations.ts";
import { projectSections } from "./workspace-projects.ts";

/** Build output facts from one captured observation, with no filesystem reads. */
export function workspaceSections(
  data: OrientationResultData,
  limit: number,
  descriptions: boolean,
): OrientationResultData {
  const facts = data.workspace;
  if (!facts) return data;
  const { observation, focus, overview } = facts;
  const root = focus ?? observation.root;
  const entries = observation.inventory.entries
    .filter((entry) => within(root, path.resolve(observation.root, entry.path)))
    .map((entry) => ({
      ...entry,
      path: path
        .relative(root, path.resolve(observation.root, entry.path))
        .replaceAll(path.sep, "/"),
    }));
  const projects = containingProjects(facts, root);
  const title = focus
    ? `Directory Orientation: ${code(display(facts.cwd, focus))}`
    : `${overview ? "Workspace Overview" : "Workspace Orientation"}: ${projects.map((project) => plain(project.name ?? project.manifestPath)).join(" / ") || plain(display(facts.cwd, root))}`;
  const notes = [
    `Root: ${code(display(facts.cwd, observation.root))}${focus ? "" : " (session working directory)"}.`,
  ];
  for (const project of projects) {
    notes.push(
      `Project: ${code(project.name ?? "Unnamed declaration")} (${project.kind}); source: ${code(sourcePath(facts, project.manifestPath))}.`,
    );
    if (project.description && descriptions)
      notes.push(
        `Declared description (${code(`${sourcePath(facts, project.manifestPath)}#${project.descriptionField}`)}): ${plain(project.description)}`,
      );
  }
  notes.push(inventoryNote(entries, facts));
  if (!descriptions && observation.projects.some((project) => project.description)) {
    notes.push(
      "Declared descriptions are omitted to preserve names and paths. They remain in the captured result.",
    );
  }
  const sections = inventorySections(entries, facts, limit);
  sections.push(...projectSections(facts, limit, descriptions));
  sections.push(...gradleSections(observation.gradle, limit));
  const issues = [
    ...observation.collection.errors
      .filter(
        (error) =>
          error.stage !== "metadata" ||
          !observation.metadata.issues.some(
            (issue) => issue.path === error.path && issue.reason === error.reason,
          ),
      )
      .map((error) => `${error.stage}: ${sourcePath(facts, error.path ?? ".")}: ${error.reason}`),
    ...observation.metadata.issues.map(
      (issue) =>
        `${sourcePath(facts, issue.path)}${issue.field ? `#${issue.field}` : ""}: ${issue.kind}: ${issue.reason}`,
    ),
  ];
  if (issues.length > 0)
    sections.push(
      tableSection("workspace.issues", "Collection limits", {
        headers: ["Observation"],
        rows: [...new Set(issues)].map((issue) => [plain(issue)]),
        limit,
        detail: "captured collection",
      }),
    );
  // Instruction text is independent of the navigation budget and list cap.
  const instructions = data.sections.filter((section) => section.key === "instructions");
  const resultSections = [
    ...instructions,
    ...sections.map((section) => collectionStatus(section, observation)),
  ];
  return {
    ...data,
    title,
    notes,
    sections: resultSections,
    renderedSections: resultSections.map((section) => section.key),
    omittedCount: sections.reduce(
      (sum, section) =>
        sum + section.evidenceLists.reduce((total, list) => total + (list.omittedCount ?? 0), 0),
      0,
    ),
  };
}

function collectionStatus(
  section: OrientationSectionData,
  observation: WorkspaceObservation,
): OrientationSectionData {
  if (section.key === "workspace.issues" || section.key.startsWith("gradle.")) return section;
  const state = workspaceCollectionStatus(observation.collection);
  const partial = section.provenance.some((source) => source.source === "filesystem")
    ? state.inventoryPartial
    : state.metadataPartial;
  if (!partial) return section;
  return {
    ...section,
    status: "partial",
    reason: state.reason,
    evidenceLists: section.evidenceLists.map((list) => ({
      ...list,
      totalCount: null,
      partialReason: state.partialReason,
    })),
  };
}

/** Nearest project declarations containing the focus, established by parsed metadata. */
export function containingProjects(facts: WorkspaceOrientationFacts, root: string) {
  const candidates = facts.observation.projects.filter((project) =>
    within(path.resolve(facts.observation.root, project.directory), root),
  );
  const depth = Math.max(
    -1,
    ...candidates.map((project) => path.resolve(facts.observation.root, project.directory).length),
  );
  return candidates.filter(
    (project) => path.resolve(facts.observation.root, project.directory).length === depth,
  );
}

function inventoryNote(
  entries: readonly InventoryEntry[],
  facts: WorkspaceOrientationFacts,
): string {
  const files = entries.filter((entry) => entry.kind === "file").length;
  const links = entries.length - files;
  const { inclusion, collection } = facts.observation;
  const policy =
    inclusion.source === "git"
      ? inclusion.includeIgnored
        ? "Git-tracked and untracked paths, including ignored paths for this explicit focus"
        : "Git-tracked and non-ignored untracked paths"
      : "accessible filesystem paths";
  const exclusions = inclusion.exclude.length
    ? ` Explicit exclusions: ${inclusion.exclude.map(code).join(", ")}.`
    : "";
  return `Inventory: ${files} regular file${files === 1 ? "" : "s"} and ${links} symbolic links. Includes ${policy}; link targets are not followed.${exclusions} Collection ${collection.status}${collection.stopReason !== "complete" ? ` (${collection.stopReason}; more entries may exist)` : ""}.`;
}

/** Named inventory observations before presentation and per-list selection. */
export interface WorkspaceInventoryFacts {
  readonly directories: readonly { path: string; entryCount: number }[];
  readonly directFiles: readonly InventoryEntry[];
  readonly extensions: readonly { extension: string; fileCount: number }[];
}

/** Derive direct children and extension counts from the already captured inventory. */
export function collectWorkspaceInventory(
  entries: readonly InventoryEntry[],
): WorkspaceInventoryFacts {
  const directories = new Map<string, number>();
  const extensions = new Map<string, number>();
  for (const entry of entries) {
    const parts = entry.path.split("/");
    if (parts.length > 1) directories.set(parts[0], (directories.get(parts[0]) ?? 0) + 1);
    if (entry.kind === "file") {
      const extension = path.posix.extname(entry.path);
      extensions.set(extension, (extensions.get(extension) ?? 0) + 1);
    }
  }
  return {
    directories: [...directories]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ path: `${name}/`, entryCount: count })),
    directFiles: entries.filter((entry) => !entry.path.includes("/")),
    extensions: [...extensions]
      .sort(([a, an], [b, bn]) => bn - an || a.localeCompare(b))
      .map(([extension, count]) => ({ extension, fileCount: count })),
  };
}

function inventorySections(
  entries: readonly InventoryEntry[],
  facts: WorkspaceOrientationFacts,
  limit: number,
): OrientationSectionData[] {
  const { directories, directFiles, extensions } = collectWorkspaceInventory(entries);
  const sections = [
    tableSection("workspace.directories", "Direct directories", {
      headers: ["Path", "Entries at all depths"],
      rows: directories.map(({ path: directory, entryCount }) => [
        code(directory),
        String(entryCount),
      ]),
      limit,
      detail: "included paths",
    }),
  ];
  if (directFiles.length > 0 || !facts.overview)
    sections.push(
      tableSection("workspace.files", "Direct files", {
        headers: ["Path", "Kind"],
        rows: directFiles.map((entry) => [code(entry.path), entry.kind]),
        limit: facts.overview ? Math.min(5, limit) : limit,
        detail: "included paths",
      }),
    );
  sections.push(
    tableSection("workspace.extensions", "File extensions (filenames, not language support)", {
      headers: ["Extension", "Regular files"],
      rows: extensions.map(({ extension, fileCount }) => [
        extension ? code(extension) : "No extension",
        String(fileCount),
      ]),
      limit: facts.overview ? Math.min(5, limit) : limit,
      detail: "included regular files",
    }),
  );
  return sections;
}

export function display(cwd: string, target: string): string {
  return path.relative(cwd, target).replaceAll(path.sep, "/") || ".";
}
