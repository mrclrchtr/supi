import * as path from "node:path";
import type { ProjectDeclaration, ProjectRelationship } from "../../analysis/workspace/types.ts";
import {
  type WorkspaceOrientationFacts,
  within,
} from "../../session/orientation/workspace-context.ts";
import type { OrientationSectionData } from "../../session/orientation-types.ts";
import { code, plain, sourcePath, tableSection } from "./workspace-format.ts";

/** Project identities and native declarations, without inferred roles or source roots. */
export function projectSections(
  facts: WorkspaceOrientationFacts,
  limit: number,
  descriptions: boolean,
): OrientationSectionData[] {
  const { observation, focus } = facts;
  const projects = observation.projects.filter(
    (project) => !focus || within(focus, path.resolve(observation.root, project.directory)),
  );
  const nested = projects.filter(
    (project) => path.resolve(observation.root, project.directory) !== (focus ?? observation.root),
  );
  const header = [
    "Kind",
    "Name",
    "Path",
    "Identity source",
    ...(descriptions ? ["Declared description"] : []),
  ];
  const result = [
    tableSection("workspace.projects", "Project declarations", {
      headers: header,
      rows: nested.map((project) => [
        project.kind,
        code(project.name ?? "Unnamed declaration"),
        code(sourcePath(facts, project.directory)),
        code(
          `${sourcePath(facts, project.manifestPath)}${project.nameField ? `#${project.nameField}` : ""}`,
        ),
        ...(descriptions
          ? [
              project.description
                ? `${plain(project.description)} (${code(`${sourcePath(facts, project.manifestPath)}#${project.descriptionField}`)})`
                : "—",
            ]
          : []),
      ]),
      limit,
      detail: "parsed project metadata",
      source: "manifest",
    }),
  ];
  const memberships = projects.flatMap((project) =>
    project.memberships.map((membership) => [
      code(sourcePath(facts, project.directory)),
      membership.kind,
      code(`${sourcePath(facts, membership.manifestPath)}#${membership.field}`),
      code(membership.value),
    ]),
  );
  if (memberships.length > 0 && !facts.overview)
    result.push(
      tableSection("workspace.memberships", "Declared memberships", {
        headers: ["Project", "Kind", "Source", "Value"],
        rows: memberships,
        limit,
        detail: "workspace configuration",
        source: "manifest",
      }),
    );
  if (!focus) return result;
  for (const project of projects.filter(
    (project) => path.resolve(observation.root, project.directory) === focus,
  )) {
    result.push(declaredPaths(project, limit, facts));
    const edges = observation.relationships.filter(
      (edge) => edge.from === project.id || edge.to === project.id,
    );
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

function declaredPaths(
  project: ProjectDeclaration,
  limit: number,
  facts: WorkspaceOrientationFacts,
): OrientationSectionData {
  const byPath = new Map<string, string[]>();
  for (const entry of project.declaredPaths) {
    const fields = byPath.get(entry.path) ?? [];
    fields.push(entry.field);
    byPath.set(entry.path, fields);
  }
  return tableSection(`${project.id}.paths`, "Declared paths (project-relative)", {
    headers: ["Path", "Fields"],
    rows: [...byPath]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([value, fields]) => [code(value), fields.map(code).join(", ")]),
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
