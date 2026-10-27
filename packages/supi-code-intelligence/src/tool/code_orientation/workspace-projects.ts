import * as path from "node:path";
import type {
  ProjectDeclaration,
  ProjectMembership,
  ProjectRelationship,
} from "../../analysis/workspace/types.ts";
import type { WorkspaceOrientationFacts } from "../../session/orientation/workspace-context.ts";
import type { OrientationItem, OrientationSectionData } from "../../session/orientation-types.ts";
import { code, plain, sourcePath, tableSection } from "./workspace-format.ts";
import {
  declaredPathObservations,
  projectObservations,
  projectRelationships,
} from "./workspace-observations.ts";

/** Project identities and native declarations, without inferred roles or source roots. */
export function projectSections(
  facts: WorkspaceOrientationFacts,
  limit: number,
  descriptions: boolean,
): OrientationSectionData[] {
  const { observation, focus } = facts;
  const { nested, focused, memberships } = projectObservations(facts);
  const result = [projectDeclarations(nested, facts, { limit, descriptions })];
  if (!facts.overview) {
    const section = membershipSection(memberships, facts, {
      limit,
      listedProjects: nested.slice(0, limit),
    });
    if (section) result.push(section);
  }
  if (!focus) return result;
  for (const project of focused) {
    result.push(declaredPaths(project, limit, facts));
    const edges = projectRelationships(observation, project);
    result.push(relationshipSection(project, edges, facts, limit));
    const unmatched =
      project.dependencies.length - edges.filter((edge) => edge.from === project.id).length;
    result.push({
      key: `${project.id}.other`,
      title: "Other declarations",
      status: "complete",
      reason: null,
      confidence: "unavailable",
      provenance: [{ source: "manifest", detail: project.manifestPath }],
      evidenceLists: [],
      items: [
        {
          kind: "paragraph",
          text: `${unmatched} dependency declarations do not match a unique observed project identity. Read ${code(sourcePath(facts, project.manifestPath))} for those declarations and other manifest fields. Name matches do not establish installed dependency resolution.`,
        },
      ],
    });
  }
  return result;
}

/** Bound declarations before grouping so shared provenance cannot multiply the list cap. */
function projectDeclarations(
  projects: readonly ProjectDeclaration[],
  facts: WorkspaceOrientationFacts,
  options: { limit: number; descriptions: boolean },
): OrientationSectionData {
  const selected = projects.slice(0, options.limit);
  const groups = new Map<
    string,
    { kind: ProjectDeclaration["kind"]; source: string; projects: ProjectDeclaration[] }
  >();
  for (const project of selected) {
    const manifest = path.posix.relative(project.directory, project.manifestPath);
    const source = `${manifest}${project.nameField ? `#${project.nameField}` : ""}`;
    const key = JSON.stringify([project.kind, source]);
    let group = groups.get(key);
    if (!group) {
      group = { kind: project.kind, source, projects: [] };
      groups.set(key, group);
    }
    group.projects.push(project);
  }
  const items: OrientationItem[] = [];
  for (const group of groups.values()) {
    if (items.length > 0) items.push({ kind: "blank" });
    items.push(
      {
        kind: "paragraph",
        text: `${group.kind}; identity source: ${code(group.source)} relative to each listed project path.`,
      },
      {
        kind: "table",
        headers: ["Name", "Path", ...(options.descriptions ? ["Declared description"] : [])],
        rows: group.projects.map((project) => [
          code(project.name ?? "Unnamed declaration"),
          code(sourcePath(facts, project.directory)),
          ...(options.descriptions
            ? [
                project.description
                  ? `${plain(project.description)} (${code(`${sourcePath(facts, project.manifestPath)}#${project.descriptionField}`)})`
                  : "—",
              ]
            : []),
        ]),
      },
    );
  }
  const section = projectListSection("workspace.projects", "Project declarations", {
    totalCount: projects.length,
    shownCount: selected.length,
    items,
    detail: "parsed project metadata",
  });
  return { ...section, tableEvidenceKey: section.key };
}

/** Group only identical native declarations, retaining counts of individual memberships. */
function membershipSection(
  memberships: ReturnType<typeof projectObservations>["memberships"],
  facts: WorkspaceOrientationFacts,
  options: { limit: number; listedProjects: readonly ProjectDeclaration[] },
): OrientationSectionData | null {
  if (memberships.length === 0) return null;
  const selected = memberships.slice(0, options.limit);
  const groups = new Map<
    string,
    { membership: ProjectMembership; projects: ProjectDeclaration[] }
  >();
  for (const { project, membership } of selected) {
    const key = JSON.stringify([
      membership.kind,
      membership.manifestPath,
      membership.field,
      membership.value,
    ]);
    let group = groups.get(key);
    if (!group) {
      group = { membership, projects: [] };
      groups.set(key, group);
    }
    group.projects.push(project);
  }
  const items: OrientationItem[] = [];
  for (const { membership, projects: members } of groups.values()) {
    const source = `${sourcePath(facts, membership.manifestPath)}#${membership.field}`;
    const reference = listedProjectReference(members, options.listedProjects);
    const paths =
      reference ?? members.map((project) => code(sourcePath(facts, project.directory))).join(", ");
    items.push({
      kind: "paragraph",
      text: `${membership.kind}; source: ${code(source)}; value: ${code(membership.value)}. Projects: ${paths}.`,
    });
  }
  return projectListSection("workspace.memberships", "Declared memberships", {
    totalCount: memberships.length,
    shownCount: selected.length,
    items,
    detail: "workspace configuration",
  });
}

/** A shared label is safe only when the selected members exactly match the named visible set. */
function listedProjectReference(
  members: readonly ProjectDeclaration[],
  listed: readonly ProjectDeclaration[],
): string | null {
  const kind = members[0]?.kind;
  const candidates = listed.filter((project) => project.kind === kind);
  const ids = new Set(members.map((project) => project.id));
  return candidates.length === members.length && candidates.every((project) => ids.has(project.id))
    ? `all ${members.length} listed ${kind} declarations`
    : null;
}

function projectListSection(
  key: string,
  title: string,
  options: {
    totalCount: number;
    shownCount: number;
    items: OrientationItem[];
    detail: string;
  },
): OrientationSectionData {
  return {
    key,
    title,
    status: "complete",
    reason: null,
    confidence: "unavailable",
    provenance: [{ source: "manifest", detail: options.detail }],
    evidenceLists: [
      {
        key,
        totalCount: options.totalCount,
        shownCount: options.shownCount,
        omittedCount: options.totalCount - options.shownCount,
        partialReason: null,
      },
    ],
    items: options.items.length
      ? options.items
      : [
          {
            kind: "paragraph",
            text: options.totalCount > 0 ? "No entries shown." : "No collected entries.",
          },
        ],
  };
}

function declaredPaths(
  project: ProjectDeclaration,
  limit: number,
  facts: WorkspaceOrientationFacts,
): OrientationSectionData {
  return tableSection(`${project.id}.paths`, "Declared paths (project-relative)", {
    headers: ["Path", "Fields"],
    rows: declaredPathObservations(project).map(({ path: value, fields }) => [
      code(value),
      fields.map(code).join(", "),
    ]),
    limit,
    detail: sourcePath(facts, project.manifestPath),
    source: "manifest",
  });
}

function relationshipSection(
  project: ProjectDeclaration,
  edges: readonly ProjectRelationship[],
  facts: WorkspaceOrientationFacts,
  limit: number,
): OrientationSectionData {
  const selected = edges.slice(0, limit);
  const ids = [...new Set(selected.flatMap((edge) => [edge.from, edge.to]))].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const labels = new Map(facts.observation.projects.map((entry) => [entry.id, entry]));
  const lines = ["flowchart LR"];
  for (const [index, id] of ids.entries()) {
    const entry = labels.get(id);
    lines.push(
      `  n${index}["${mermaid(entry?.name ?? id)}<br/>${mermaid(entry ? sourcePath(facts, entry.directory) : id)}"]`,
    );
  }
  for (const edge of selected) {
    lines.push(
      `  n${ids.indexOf(edge.from)} -->|"${mermaid(`${edge.field}: ${typeof edge.value === "string" ? edge.value : JSON.stringify(edge.value)}`)}"| n${ids.indexOf(edge.to)}`,
    );
  }
  return {
    key: `${project.id}.relationships`,
    title: "Declared project relationships",
    status: "complete",
    reason: null,
    confidence: "unavailable",
    provenance: [
      { source: "manifest", detail: "dependency fields in each source node's manifest" },
    ],
    evidenceLists: [
      {
        key: `${project.id}.relationships`,
        totalCount: edges.length,
        shownCount: selected.length,
        omittedCount: edges.length - selected.length,
        partialReason: null,
      },
    ],
    items: [
      {
        kind: "paragraph",
        text: "Each edge retains its source field and value. These are declarations, not a runtime graph or proof of installed dependency resolution.",
      },
      ...(selected.length ? [{ kind: "code" as const, language: "mermaid", lines }] : []),
    ],
  };
}

/** Mermaid entity escapes prevent repository names from creating diagram syntax. */
function mermaid(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[#"<>`&|\\\p{Cc}\p{Cf}]/gu, (character) => `#${character.codePointAt(0) ?? 0};`);
}
