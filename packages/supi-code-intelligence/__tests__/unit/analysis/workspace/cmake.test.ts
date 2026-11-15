// biome-ignore-all lint/security/noSecrets: CMake fixture text, not secrets
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: literal CMake variable references
import { afterEach, describe, expect, it } from "vitest";
import { observeWorkspace } from "../../../../src/analysis/workspace/index.ts";
import { cleanupWorkspaces, makeWorkspace, write, writeJson } from "./helpers.ts";

afterEach(cleanupWorkspaces);

async function observeCMake(content: string) {
  const root = makeWorkspace();
  write(root, "CMakeLists.txt", content);
  return observeWorkspace(root);
}

describe("observeWorkspace CMake declarations", () => {
  it("reports one top-level literal project() with its description and no targets or subdirectories", async () => {
    const root = makeWorkspace();
    write(
      root,
      "CMakeLists.txt",
      [
        "#[[ bracket comment with project(Fake) ]]",
        "cmake_minimum_required(VERSION 3.20)",
        "# project(Commented)",
        'PROJECT(Engine VERSION 1.2 DESCRIPTION "Rendering engine" LANGUAGES CXX)',
        "add_subdirectory(lib)",
        "add_subdirectory(tools)",
        "add_executable(engine main.cpp)",
        "",
      ].join("\n"),
    );
    write(root, "lib/CMakeLists.txt", "add_library(core STATIC core.cpp)\n");
    write(root, "tools/CMakeLists.txt", "project([[Tool Kit]])\nadd_executable(tool tool.cpp)\n");

    const result = await observeWorkspace(root);

    expect(result.projects).toEqual([
      expect.objectContaining({
        id: "CMakeLists.txt",
        kind: "cmake-project",
        directory: ".",
        name: "Engine",
        nameField: "project",
        description: "Rendering engine",
        descriptionField: "project.DESCRIPTION",
        memberships: [],
        dependencies: [],
      }),
      expect.objectContaining({ id: "tools/CMakeLists.txt", name: "Tool Kit", description: null }),
    ]);
    expect(result.relationships).toEqual([]);
    expect(result.metadata.issues).toEqual([]);
    expect(result.metadata.documents.map((document) => document.path)).toContain(
      "lib/CMakeLists.txt",
    );
    expect(result.collection.status).toBe("complete");
  });

  it("does not select any of repeated project() calls", async () => {
    const result = await observeCMake("project(First)\nproject(Second)\n");
    expect(result.projects).toEqual([]);
    expect(result.metadata.issues).toEqual([
      expect.objectContaining({
        field: "project",
        kind: "unresolved",
        reason: expect.stringContaining("lines 1, 2"),
      }),
    ]);
  });

  it.each([
    ["conditional", "if(WIN32)\n  project(Win)\nendif()\n"],
    ["function body", "function(make)\n  project(Inner)\nendfunction()\n"],
    ["macro body", "macro(make)\n  project(Inner)\nendmacro()\n"],
  ])("discloses a %s project() as dynamic", async (_label, content) => {
    const result = await observeCMake(content);
    expect(result.projects).toEqual([]);
    expect(result.metadata.issues).toEqual([
      expect.objectContaining({ field: "project line 2", kind: "dynamic" }),
    ]);
  });

  it.each(["project(${NAME})", 'project("$ENV{NAME}")', "project(app_$<CONFIG>)"])(
    "discloses variable-dependent names: %s",
    async (content) => {
      const result = await observeCMake(`${content}\n`);
      expect(result.projects).toEqual([]);
      expect(result.metadata.issues).toEqual([
        expect.objectContaining({ field: "project line 1", kind: "dynamic" }),
      ]);
    },
  );

  it("keeps the project when only the description is dynamic", async () => {
    const result = await observeCMake('project(App DESCRIPTION "${DESC}")\n');
    expect(result.projects[0]).toMatchObject({
      name: "App",
      description: null,
      descriptionField: null,
    });
    expect(result.metadata.issues).toEqual([
      expect.objectContaining({ field: "project.DESCRIPTION", kind: "dynamic" }),
    ]);
  });

  it("reports malformed syntax without dropping independent evidence", async () => {
    const root = makeWorkspace();
    write(root, "CMakeLists.txt", 'project(Broken\nadd_executable(app "main.cpp)\n');
    writeJson(root, "web/package.json", { name: "web" });
    write(root, "go/go.mod", "module example.com/go\n");

    const result = await observeWorkspace(root);

    expect(result.projects.map((project) => [project.kind, project.name])).toEqual([
      ["go-module", "example.com/go"],
      ["node-package", "web"],
    ]);
    expect(result.metadata.issues).toEqual([
      expect.objectContaining({ path: "CMakeLists.txt", kind: "malformed" }),
    ]);
    expect(result.collection.status).toBe("partial");
  });

  it("ignores CMakeLists.txt files without project()", async () => {
    const result = await observeCMake("add_library(core core.cpp)\n");
    expect(result.projects).toEqual([]);
    expect(result.metadata.issues).toEqual([]);
  });
});
