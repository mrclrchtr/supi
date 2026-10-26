import { readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { observeWorkspace } from "../../../../src/analysis/workspace/observe.ts";
import {
  type WorkspaceOrientationFacts,
  workspaceOrientationData,
} from "../../../../src/session/orientation/workspace-context.ts";
import type { OrientationSectionData } from "../../../../src/session/orientation-types.ts";
import {
  prepareWorkspaceOutput,
  WORKSPACE_BUDGETS,
} from "../../../../src/tool/code_orientation/workspace-output.ts";
import { projectSections } from "../../../../src/tool/code_orientation/workspace-projects.ts";
import {
  cleanupWorkspaces,
  makeWorkspace,
  write,
  writeJson,
} from "../../analysis/workspace/helpers.ts";

let root: string;
const snapshots: string[] = [];

beforeEach(() => {
  root = makeWorkspace("workspace-project-output-");
});
afterEach(() => {
  cleanupWorkspaces();
  for (const snapshot of snapshots.splice(0))
    rmSync(dirname(snapshot), { recursive: true, force: true });
});

async function facts(): Promise<WorkspaceOrientationFacts> {
  return { observation: await observeWorkspace(root), cwd: root, focus: null, maxResults: 10 };
}

function section(sections: readonly OrientationSectionData[], key: string): OrientationSectionData {
  const found = sections.find((entry) => entry.key === key);
  expect(found).toBeDefined();
  return found!;
}

function paragraphs(value: OrientationSectionData): string[] {
  return value.items.flatMap((item) => (item.kind === "paragraph" ? [item.text] : []));
}

function rows(value: OrientationSectionData): readonly (readonly string[])[] {
  return value.items.flatMap((item) => (item.kind === "table" ? item.rows : []));
}

function mixedProjects() {
  writeJson(root, "package.json", { name: "root" });
  writeJson(root, "units/app/package.json", {
    name: "@test/app",
    description: "Application package",
  });
  writeJson(root, "units/core/package.json", { name: "@test/core" });
  write(root, "service/pyproject.toml", ["[project]", 'name = "api"', ""].join("\n"));
  write(root, "crate/Cargo.toml", '[package]\nname = "crate"\nversion = "0.1.0"\n');
  write(root, "go/go.mod", "module example.com/go\n\ngo 1.22\n");
}

describe("compact workspace project evidence", () => {
  it("shares only matching native identity sources while retaining names, paths, and descriptions", async () => {
    mixedProjects();
    const declarations = section(projectSections(await facts(), 10, true), "workspace.projects");

    expect(paragraphs(declarations)).toEqual([
      "rust-package; identity source: `Cargo.toml#package.name` relative to each listed project path.",
      "go-module; identity source: `go.mod#module` relative to each listed project path.",
      "python-project; identity source: `pyproject.toml#project.name` relative to each listed project path.",
      "node-package; identity source: `package.json#name` relative to each listed project path.",
    ]);
    expect(rows(declarations)).toEqual([
      ["`crate`", "`crate`", "—"],
      ["`example.com/go`", "`go`", "—"],
      ["`api`", "`service`", "—"],
      // biome-ignore lint/security/noSecrets: Expected attributed fixture description, not a secret.
      ["`@test/app`", "`units/app`", "Application package (`units/app/package.json#description`)"],
      ["`@test/core`", "`units/core`", "—"],
    ]);
    expect(declarations.evidenceLists).toEqual([
      expect.objectContaining({ totalCount: 5, shownCount: 5, omittedCount: 0 }),
    ]);
  });

  it("does not invent an identity field or assume the manifest basename", async () => {
    writeJson(root, "units/app/package.json", { name: "app" });
    writeJson(root, "units/unnamed/package.json", {});
    const input = await facts();
    const observation = {
      ...input.observation,
      projects: input.observation.projects.map((project) =>
        project.name === "app"
          ? { ...project, manifestPath: "metadata/app.json", nameField: "identity.name" }
          : project,
      ),
    };
    const declarations = section(
      projectSections({ ...input, observation }, 10, false),
      "workspace.projects",
    );

    expect(paragraphs(declarations)).toEqual([
      "node-package; identity source: `../../metadata/app.json#identity.name` relative to each listed project path.",
      "node-package; identity source: `package.json` relative to each listed project path.",
    ]);
    expect(rows(declarations)).toContainEqual(["`Unnamed declaration`", "`units/unnamed`"]);
  });

  it("applies one declaration limit before grouping and discloses exact omissions", async () => {
    mixedProjects();
    const input = await facts();
    const declarations = section(projectSections(input, 3, false), "workspace.projects");
    const selected = input.observation.projects
      .filter((project) => project.directory !== ".")
      .slice(0, 3);

    expect(rows(declarations)).toEqual(
      selected.map((project) => [`\`${project.name}\``, `\`${project.directory}\``]),
    );
    expect(declarations.evidenceLists).toEqual([
      expect.objectContaining({ totalCount: 5, shownCount: 3, omittedCount: 2 }),
    ]);

    const hidden = section(projectSections(input, 0, false), "workspace.projects");
    expect(paragraphs(hidden)).toEqual(["No entries shown."]);
    expect(hidden.evidenceLists).toEqual([
      expect.objectContaining({ totalCount: 5, shownCount: 0, omittedCount: 5 }),
    ]);
  });

  it("references an exact visible member set without assigning memberships to other kinds", async () => {
    mixedProjects();
    write(root, "pnpm-workspace.yaml", "packages:\n  - units/*\n");
    const memberships = section(projectSections(await facts(), 10, false), "workspace.memberships");

    expect(paragraphs(memberships)).toEqual([
      "node-workspace; source: `pnpm-workspace.yaml#packages`; value: `units/*`. Projects: all 2 listed node-package declarations.",
    ]);
    expect(memberships.evidenceLists).toEqual([
      expect.objectContaining({ totalCount: 2, shownCount: 2, omittedCount: 0 }),
    ]);
  });

  it("keeps overlapping values and distinct sources separate and names partial member sets explicitly", async () => {
    writeJson(root, "package.json", { name: "root", workspaces: ["units/*", "units/app"] });
    write(root, "pnpm-workspace.yaml", "packages:\n  - units/*\n");
    writeJson(root, "units/app/package.json", { name: "app" });
    writeJson(root, "units/core/package.json", { name: "core" });
    writeJson(root, "other/package.json", { name: "not-a-member" });
    const input = await facts();
    const memberships = section(projectSections(input, 10, false), "workspace.memberships");

    expect(paragraphs(memberships)).toEqual([
      "node-workspace; source: `package.json#workspaces`; value: `units/app`. Projects: `units/app`.",
      "node-workspace; source: `pnpm-workspace.yaml#packages`; value: `units/*`. Projects: `units/app`, `units/core`.",
      "node-workspace; source: `package.json#workspaces`; value: `units/*`. Projects: `units/core`.",
    ]);
    expect(memberships.evidenceLists).toEqual([
      expect.objectContaining({ totalCount: 4, shownCount: 4, omittedCount: 0 }),
    ]);

    const bounded = section(projectSections(input, 1, false), "workspace.memberships");
    expect(paragraphs(bounded)).toEqual([
      "node-workspace; source: `package.json#workspaces`; value: `units/app`. Projects: `units/app`.",
    ]);
    expect(bounded.evidenceLists).toEqual([
      expect.objectContaining({ totalCount: 4, shownCount: 1, omittedCount: 3 }),
    ]);
  });

  it("does not replace member paths with a label when the member set exceeds visible declarations", async () => {
    writeJson(root, "package.json", { workspaces: ["units/*"] });
    writeJson(root, "other/package.json", { name: "not-a-member" });
    writeJson(root, "units/app/package.json", { name: "app" });
    writeJson(root, "units/core/package.json", { name: "core" });
    const memberships = section(projectSections(await facts(), 2, false), "workspace.memberships");

    expect(paragraphs(memberships)).toEqual([
      "node-workspace; source: `package.json#workspaces`; value: `units/*`. Projects: `units/app`, `units/core`.",
    ]);
    expect(memberships.evidenceLists).toEqual([
      expect.objectContaining({ totalCount: 2, shownCount: 2, omittedCount: 0 }),
    ]);
  });

  it("keeps a mixed 25-package workspace under both soft budgets without omitting project identities", async () => {
    const names = Array.from(
      { length: 25 },
      (_, index) => `supi-package-${String(index).padStart(2, "0")}`,
    );
    writeJson(root, "package.json", {
      name: "@mrclrchtr/supi-workspace",
      pi: { extensions: names.slice(0, 17).map((name) => `./packages/${name}/src/extension.ts`) },
    });
    write(root, "pnpm-workspace.yaml", "packages:\n  - packages/*\n");
    for (const name of names) {
      writeJson(root, `packages/${name}/package.json`, { name: `@mrclrchtr/${name}` });
      write(root, `packages/${name}/src/extension.ts`, "export default function extension() {}\n");
    }
    const baseline = "packages/supi-package-00/__tests__/fixtures/language-baseline";
    write(root, `${baseline}/go/go.mod`, "module example.com/language-baseline\n");
    write(
      root,
      `${baseline}/rust/Cargo.toml`,
      '[package]\nname = "language-baseline"\nversion = "0.1.0"\n',
    );
    const input = await facts();

    for (const surface of ["overview", "orientation"] as const) {
      const output = prepareWorkspaceOutput(
        workspaceOrientationData({
          ...input,
          overview: surface === "overview",
          focus: surface === "overview" ? null : root,
          maxResults: 50,
        }),
      );
      const snapshot = output.data.notes
        .join("\n")
        .match(/Complete captured result[^`]*`([^`]+)`/)?.[1];
      expect(snapshot).toBeDefined();
      snapshots.push(snapshot!);
      expect(output.warning).toBeUndefined();
      expect(Math.ceil(output.content.length / 4)).toBeLessThanOrEqual(
        WORKSPACE_BUDGETS[surface].warning,
      );
      const declarations = section(output.data.sections, "workspace.projects");
      expect(declarations.evidenceLists).toEqual([
        expect.objectContaining({ totalCount: 27, shownCount: 27, omittedCount: 0 }),
      ]);
      for (const project of input.observation.projects.filter(
        (project) => project.directory !== ".",
      )) {
        expect(rows(declarations).map((row) => row.slice(0, 2))).toContainEqual([
          `\`${project.name}\``,
          `\`${project.directory}\``,
        ]);
      }
      expect(readFileSync(snapshot!, "utf8")).toContain('"manifestPath": "pnpm-workspace.yaml"');
    }
  });
});
