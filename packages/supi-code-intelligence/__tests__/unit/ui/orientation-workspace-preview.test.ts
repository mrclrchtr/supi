import { initTheme } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
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
      shownCount: 20,
      totalCount: 25,
      omittedCount: 5,
    });
    expect(preview).toContain("Project declarations (20 of 25; 5 omitted)");
    expect(preview).toContain("Name | Path");
    expect(preview).toContain("project-20 | packages/project-20");
    expect(preview).not.toContain("project-21");
    expect(assembly.details.evidenceLists).toContainEqual({
      key: "workspace.projects",
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
      shownCount: 20,
      totalCount: 25,
      omittedCount: 5,
    });
    expect(preview).toContain("node-12");
    expect(preview).toContain("rust-8");
    expect(preview).not.toContain("rust-9");
    expect(preview).toContain("node-package; identity source:");
    expect(preview).toContain("rust-package; identity source:");
    expect(preview.match(/Name \| Path/g)).toHaveLength(2);
  });

  it.each([
    { count: 30, limit: 25, shown: 20, omitted: 10 },
    { count: 25, limit: 5, shown: 5, omitted: 20 },
    { count: 5, limit: 0, shown: 0, omitted: 5 },
  ])("preserves upstream omissions for $count rows with limit $limit", (testCase) => {
    const assembly = assemblePreview(projectTable(testCase.count, testCase.limit));

    expect(assembly.displaySections[0]).toMatchObject({
      shownCount: testCase.shown,
      totalCount: testCase.count,
      omittedCount: testCase.omitted,
    });
    expect(renderPreview(assembly)).toContain(
      `Project declarations (${testCase.shown} of ${testCase.count}; ${testCase.omitted} omitted)`,
    );
  });

  it.each([
    { limit: 25, upstreamOmitted: 5, shown: 20, displayOmitted: 10 },
    { limit: 25, upstreamOmitted: null, shown: 20, displayOmitted: 5 },
    { limit: 5, upstreamOmitted: null, shown: 5, displayOmitted: null },
  ])("keeps partial totals unknown with $limit rows and $upstreamOmitted omissions", (testCase) => {
    const section = projectTable(30, testCase.limit);
    const assembly = assemblePreview({
      ...section,
      status: "partial",
      reason: "Inventory collection is incomplete",
      evidenceLists: [
        {
          key: section.key,
          totalCount: null,
          shownCount: testCase.limit,
          omittedCount: testCase.upstreamOmitted,
          partialReason: "safety-limit",
          partialMessage: "Collection stopped at its entry limit.",
        },
      ],
    });

    expect(assembly.displaySections[0]).toMatchObject({
      shownCount: testCase.shown,
      totalCount: null,
      omittedCount: testCase.displayOmitted,
      partialReason: "safety-limit",
      partialMessage: "Collection stopped at its entry limit.",
    });
    const preview = renderPreview(assembly);
    expect(preview).toContain("more may exist — safety-limit");
    expect(preview).toContain("Collection stopped at its entry limit.");
    expect(assembly.details.evidenceLists).toContainEqual({
      key: section.key,
      totalCount: null,
      shownCount: testCase.limit,
      omittedCount: testCase.upstreamOmitted,
      partialReason: "safety-limit",
      partialMessage: "Collection stopped at its entry limit.",
    });
  });

  it("leaves graph evidence and other non-table previews unchanged", () => {
    const assembly = assemblePreview({
      key: "project.relationships",
      title: "Declared project relationships",
      status: "complete",
      reason: null,
      confidence: "unavailable",
      provenance: [{ source: "manifest" }],
      evidenceLists: [
        {
          key: "project.relationships",
          totalCount: 25,
          shownCount: 25,
          omittedCount: 0,
          partialReason: null,
        },
      ],
      items: [
        { kind: "paragraph", text: "Declared edges are not a runtime graph." },
        { kind: "code", language: "mermaid", lines: ["flowchart LR", "a --> b"] },
      ],
    });

    expect(assembly.displaySections[0]).toMatchObject({
      shownCount: 2,
      totalCount: 2,
      omittedCount: 0,
    });
    expect(renderPreview(assembly)).toContain("Declared project relationships (2)");
  });

  it("keeps an empty table message without counting it as evidence", () => {
    const assembly = assemblePreview(projectTable(0));
    const preview = renderPreview(assembly);

    expect(assembly.displaySections[0]).toMatchObject({
      shownCount: 0,
      totalCount: 0,
      omittedCount: 0,
    });
    expect(preview).toContain("Project declarations (0)");
    expect(preview).toContain("No collected entries.");
  });
});
