import { initTheme } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createBoundedEvidenceList,
  createPartialEvidenceList,
} from "../../../src/analysis/evidence.ts";
import { observeWorkspace } from "../../../src/analysis/workspace/observe.ts";
import type { OrientationSectionData } from "../../../src/session/orientation-types.ts";
import { renderOrientationResult as renderOrientationMarkdown } from "../../../src/tool/code_orientation/markdown.ts";
import { assembleOrientationResult } from "../../../src/tool/code_orientation/result.ts";
import { renderOrientationResult as renderOrientationTui } from "../../../src/tool/code_orientation/tui.ts";
import { tableSection } from "../../../src/tool/code_orientation/workspace-format.ts";
import { projectSections } from "../../../src/tool/code_orientation/workspace-projects.ts";
import {
  cleanupWorkspaces,
  makeWorkspace,
  write,
  writeJson,
} from "../analysis/workspace/helpers.ts";

const testTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

beforeAll(() => initTheme("dark"));
afterEach(() => cleanupWorkspaces());

function projectTable(count: number, limit = count): OrientationSectionData {
  return tableSection("workspace.projects", "Project declarations", {
    headers: ["Name", "Path"],
    rows: Array.from({ length: count }, (_, index) => [
      `project-${index + 1}`,
      `packages/project-${index + 1}`,
    ]),
    limit,
    detail: "parsed project metadata",
    source: "manifest",
  });
}

async function projectMemberships(
  count: number,
  limit = count,
  distinctGroups = false,
): Promise<OrientationSectionData> {
  const root = makeWorkspace("orientation-membership-preview-");
  writeJson(root, "package.json", { name: "root" });
  const names = Array.from(
    { length: count },
    (_, index) => `member-${String(index + 1).padStart(2, "0")}`,
  );
  const patterns = distinctGroups ? names.map((name) => `units/${name}`) : ["units/*"];
  write(
    root,
    "pnpm-workspace.yaml",
    `packages:\n${patterns.map((value) => `  - ${value}\n`).join("")}`,
  );
  for (const name of names) {
    writeJson(root, `units/${name}/package.json`, { name });
  }
  const sections = projectSections(
    { observation: await observeWorkspace(root), cwd: root, focus: null, maxResults: limit },
    limit,
    false,
  );
  const memberships = sections.find((section) => section.key === "workspace.memberships");
  if (!memberships) throw new Error("The workspace fixture has no declared memberships.");
  return memberships;
}

function assemblePreview(...sections: OrientationSectionData[]) {
  return assembleOrientationResult({
    title: "Workspace Orientation",
    notes: [],
    sections,
    confidence: "unavailable",
    focusTarget: null,
    requestedSections: [],
    renderedSections: sections.map((section) => section.key),
    omittedCount: 0,
    nextQueries: [],
    readNext: [],
  });
}

function renderPreview(assembly: ReturnType<typeof assemblePreview>, markdown = ""): string {
  const rendered = renderOrientationTui(
    {
      // Usually isolate the structured preview from its separate full-text view.
      content: markdown ? [{ type: "text", text: markdown }] : [],
      details: {
        type: "context",
        data: { ...assembly.details },
        displaySections: assembly.displaySections,
      },
    },
    { expanded: true, isPartial: false },
    testTheme,
    undefined,
  );
  return rendered.render(180).join("\n");
}

describe("Workspace Orientation structured previews", () => {
  it("caps table evidence rows without truncating canonical facts or Markdown", () => {
    const assembly = assemblePreview(projectTable(25));
    const preview = renderPreview(assembly);

    expect(assembly.displaySections[0]).toMatchObject({
      evidence: { completeness: "complete", shownCount: 25, totalCount: 25, omittedCount: 0 },
      displayOmittedCount: 5,
    });
    expect(preview).toContain("Project declarations (25; 5 rows hidden in view)");
    expect(preview).toContain("Name | Path");
    expect(preview).toContain("project-20 | packages/project-20");
    expect(preview).not.toContain("project-21");
    expect(assembly.details.evidenceLists).toContainEqual({
      key: "workspace.projects",
      completeness: "complete",
      totalCount: 25,
      shownCount: 25,
      omittedCount: 0,
      partialReason: null,
    });
    const markdown = renderOrientationMarkdown(assembly);
    expect(markdown).toContain("| project-25 | packages/project-25 |");
    const expanded = renderPreview(assembly, markdown);
    expect(expanded).toContain("▸ raw markdown");
    expect(expanded).toContain("project-25");
  });

  it("shares one row cap across grouped project tables and retains their framing", async () => {
    const root = makeWorkspace("orientation-table-preview-");
    for (let index = 1; index <= 12; index++) {
      writeJson(root, `a-node-${index}/package.json`, { name: `node-${index}` });
    }
    for (let index = 1; index <= 13; index++) {
      write(
        root,
        `b-rust-${String(index).padStart(2, "0")}/Cargo.toml`,
        `[package]\nname = "rust-${index}"\nversion = "0.1.0"\n`,
      );
    }
    const sections = projectSections(
      { observation: await observeWorkspace(root), cwd: root, focus: null, maxResults: 25 },
      25,
      false,
    );
    const assembly = assemblePreview(...sections);
    const preview = renderPreview(assembly);

    expect(assembly.displaySections[0]).toMatchObject({
      evidence: { completeness: "complete", shownCount: 25, totalCount: 25, omittedCount: 0 },
      displayOmittedCount: 5,
    });
    expect(preview).toContain("node-12");
    expect(preview).toContain("rust-8");
    expect(preview).not.toContain("rust-9");
    expect(preview).toContain("node-package; identity source:");
    expect(preview).toContain("rust-package; identity source:");
    expect(preview.match(/Name \| Path/g)).toHaveLength(2);
  });

  it("distinguishes canonical memberships from their single preview group", async () => {
    const assembly = assemblePreview(await projectMemberships(25));

    expect(renderPreview(assembly)).toContain(
      "Declared memberships (25 memberships; 1 preview group)",
    );
    expect(assembly.details.evidenceLists).toContainEqual({
      key: "workspace.memberships",
      completeness: "complete",
      totalCount: 25,
      shownCount: 25,
      omittedCount: 0,
      partialReason: null,
    });
  });

  it("preserves canonical membership omissions separately from preview groups", async () => {
    const assembly = assemblePreview(await projectMemberships(25, 5));

    expect(renderPreview(assembly)).toContain(
      "Declared memberships (5 of 25 memberships; 20 omitted; 1 preview group)",
    );
  });

  it.each([
    { count: 25, summary: "25 memberships", omitted: 0 },
    { count: 30, summary: "25 of 30 memberships; 5 omitted", omitted: 5 },
  ])(
    "bounds preview groups separately from $count canonical memberships",
    async ({ count, summary, omitted }) => {
      const assembly = assemblePreview(await projectMemberships(count, 25, true));
      const preview = renderPreview(assembly);

      expect(preview).toContain(
        `Declared memberships (${summary}; 20 preview groups; 5 preview groups hidden in view)`,
      );
      expect(preview).toContain("units/member-20");
      expect(preview).not.toContain("units/member-21");
      expect(assembly.details.evidenceLists).toContainEqual({
        key: "workspace.memberships",
        completeness: omitted ? "capped" : "complete",
        totalCount: count,
        shownCount: 25,
        omittedCount: omitted,
        partialReason: null,
      });
    },
  );

  it("does not turn unknown membership totals into a preview-group evidence count", async () => {
    const section = await projectMemberships(25, 5);
    const assembly = assemblePreview({
      ...section,
      status: "partial",
      evidenceLists: section.evidenceLists.map(
        (list) =>
          createPartialEvidenceList({
            key: list.key,
            items: Array.from({ length: list.shownCount }),
            collectedCount: null,
            partialReason: "timeout",
          }).metadata,
      ),
    });
    const preview = renderPreview(assembly);

    expect(preview).toContain(
      "Declared memberships (5 memberships; more may exist — timeout; 1 preview group)",
    );
    expect(assembly.details.evidenceLists).toContainEqual({
      key: "workspace.memberships",
      completeness: "unbounded",
      totalCount: null,
      shownCount: 5,
      omittedCount: null,
      partialReason: "timeout",
    });
  });

  it.each([
    { count: 30, limit: 25, hidden: 5, bounds: "25 of 30; 5 omitted; 5 rows hidden in view" },
    { count: 25, limit: 5, hidden: 0, bounds: "5 of 25; 20 omitted" },
    { count: 5, limit: 0, hidden: 0, bounds: "0 of 5; 5 omitted" },
  ])("preserves upstream omissions for $count rows with limit $limit", (testCase) => {
    const assembly = assemblePreview(projectTable(testCase.count, testCase.limit));

    expect(assembly.displaySections[0]).toMatchObject({
      evidence: {
        completeness: "capped",
        shownCount: testCase.limit,
        totalCount: testCase.count,
        omittedCount: testCase.count - testCase.limit,
      },
      displayOmittedCount: testCase.hidden,
    });
    expect(renderPreview(assembly)).toContain(`Project declarations (${testCase.bounds})`);
  });

  it.each([
    { limit: 25, upstreamOmitted: 5, completeness: "partial", hidden: 5 },
    { limit: 25, upstreamOmitted: null, completeness: "unbounded", hidden: 5 },
    { limit: 5, upstreamOmitted: null, completeness: "unbounded", hidden: 0 },
  ] as const)(
    "keeps partial totals unknown with $limit rows and $upstreamOmitted omissions",
    (testCase) => {
      const section = projectTable(30, testCase.limit);
      const assembly = assemblePreview({
        ...section,
        status: "partial",
        reason: "Inventory collection is incomplete",
        evidenceLists: [
          createPartialEvidenceList({
            key: section.key,
            items: Array.from({ length: testCase.limit }),
            collectedCount:
              testCase.upstreamOmitted === null ? null : testCase.limit + testCase.upstreamOmitted,
            partialReason: "safety-limit",
            partialMessage: "Collection stopped at its entry limit.",
          }).metadata,
        ],
      });

      // Evidence stays partial with an unknown total; view-hidden rows stay a separate count.
      expect(assembly.displaySections[0]).toMatchObject({
        evidence: {
          completeness: testCase.completeness,
          shownCount: testCase.limit,
          totalCount: null,
          omittedCount: testCase.upstreamOmitted,
          partialReason: "safety-limit",
          partialMessage: "Collection stopped at its entry limit.",
        },
        displayOmittedCount: testCase.hidden,
      });
      const preview = renderPreview(assembly);
      expect(preview).toContain("more may exist — safety-limit");
      expect(preview).toContain("Collection stopped at its entry limit.");
      expect(assembly.details.evidenceLists).toContainEqual({
        key: section.key,
        completeness: testCase.completeness,
        totalCount: null,
        shownCount: testCase.limit,
        omittedCount: testCase.upstreamOmitted,
        partialReason: "safety-limit",
        partialMessage: "Collection stopped at its entry limit.",
      });
    },
  );

  it("distinguishes graph evidence from non-table preview blocks", () => {
    const assembly = assemblePreview({
      key: "project.relationships",
      title: "Declared project relationships",
      status: "complete",
      reason: null,
      confidence: "unavailable",
      provenance: [{ source: "manifest" }],
      evidenceLists: [
        createBoundedEvidenceList({
          key: "project.relationships",
          items: Array.from({ length: 25 }),
          totalCount: 25,
        }).metadata,
      ],
      items: [
        { kind: "paragraph", text: "Declared edges are not a runtime graph." },
        { kind: "code", language: "mermaid", lines: ["flowchart LR", "a --> b"] },
      ],
    });

    // Preview blocks are framing; their section evidence counts blocks, not graph atoms.
    expect(assembly.displaySections[0]).toMatchObject({
      evidence: { completeness: "complete", shownCount: 2, totalCount: 2, omittedCount: 0 },
      displayOmittedCount: 0,
    });
    expect(renderPreview(assembly)).toContain(
      "Declared project relationships (25 observed; 2 preview blocks)",
    );
  });

  it("keeps an empty table message without counting it as evidence", () => {
    const assembly = assemblePreview(projectTable(0));
    const preview = renderPreview(assembly);

    expect(assembly.displaySections[0]).toMatchObject({
      evidence: { completeness: "complete", shownCount: 0, totalCount: 0, omittedCount: 0 },
      displayOmittedCount: 0,
    });
    expect(preview).toContain("Project declarations (0)");
    expect(preview).toContain("No collected entries.");
  });
});
