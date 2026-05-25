import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  getDefaultWorkspaceRuntime,
  type SemanticProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, describe, expect, it } from "vitest";

describe("code_refactor tool", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    getDefaultWorkspaceRuntime().clearAll();
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  function createProjectFile(content = "oldName();\n") {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-refactor-tool-"));
    const projectDir = path.join(tmpDir, "project");
    const file = path.join(projectDir, "src", "index.ts");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, "utf-8");
    return { projectDir, file };
  }

  function createSemanticProvider(rename: SemanticProvider["rename"]): SemanticProvider {
    return {
      references: async () => null,
      implementation: async () => null,
      documentSymbols: async () => [],
      workspaceSymbols: async () => [],
      rename,
    };
  }

  it("routes code_refactor to semantic path when refactor-capable provider is registered", async () => {
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(
      "/project",
      createSemanticProvider(async () => ({ kind: "precise", edits: { edits: [] } })),
    );

    const { routeFor } = await import("../../src/planner/planner.ts");
    const route = routeFor("/project", "code_refactor");
    expect(route.preferred).toBe("semantic");
    expect(route.refactorAvailable).toBe(true);
  });

  it("routes code_refactor to unavailable when no refactor-capable provider exists", async () => {
    const { routeFor } = await import("../../src/planner/planner.ts");
    const route = routeFor("/project", "code_refactor");
    expect(route.preferred).toBe("unavailable");
    expect(route.refactorAvailable).toBe(false);
  });

  it("resolves relative file inputs against ctx.cwd and applies a precise rename", async () => {
    const { executeRefactorTool } = await import("../../src/tool/execute-refactor.ts");
    const runtime = getDefaultWorkspaceRuntime();
    const { projectDir, file } = createProjectFile();
    let capturedFile = "";
    let capturedPosition: { line: number; character: number } | null = null;

    runtime.registerSemantic(
      projectDir,
      createSemanticProvider(async (inputFile, position, newName) => {
        capturedFile = inputFile;
        capturedPosition = position;
        return {
          kind: "precise",
          edits: {
            edits: [
              {
                file,
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
                newText: newName,
              },
            ],
          },
        };
      }),
    );

    const result = await executeRefactorTool(
      {
        operation: "rename",
        file: "src/index.ts",
        line: 1,
        character: 1,
        newName: "newName",
      },
      { cwd: projectDir },
    );

    expect(capturedFile).toBe(file);
    expect(capturedPosition).toEqual({ line: 0, character: 0 });
    expect(result.content).toContain("**Refactor applied:**");
    expect(readFileSync(file, "utf-8")).toBe("newName();\n");
  });

  it("refuses to apply ambiguous provider results", async () => {
    const { executeRefactorTool } = await import("../../src/tool/execute-refactor.ts");
    const runtime = getDefaultWorkspaceRuntime();
    const { projectDir, file } = createProjectFile();

    runtime.registerSemantic(
      projectDir,
      createSemanticProvider(async () => ({
        kind: "ambiguous",
        candidates: [{ description: "candidate one", file: "/tmp/a.ts", line: 3 }],
      })),
    );

    const result = await executeRefactorTool(
      {
        operation: "rename",
        file: "src/index.ts",
        line: 1,
        character: 1,
        newName: "newName",
      },
      { cwd: projectDir },
    );

    expect(result.content).toContain("**Refactor ambiguous:**");
    expect(result.content).toContain("candidate one");
    expect(readFileSync(file, "utf-8")).toBe("oldName();\n");
  });

  it("refuses unavailable provider results without heuristic fallback", async () => {
    const { executeRefactorTool } = await import("../../src/tool/execute-refactor.ts");
    const runtime = getDefaultWorkspaceRuntime();
    const { projectDir, file } = createProjectFile();

    runtime.registerSemantic(
      projectDir,
      createSemanticProvider(async () => ({
        kind: "unavailable",
        reason: "LSP server returned no edit",
      })),
    );

    const result = await executeRefactorTool(
      {
        operation: "rename",
        file: "src/index.ts",
        line: 1,
        character: 1,
        newName: "newName",
      },
      { cwd: projectDir },
    );

    expect(result.content).toContain("**Refactor unavailable:**");
    expect(readFileSync(file, "utf-8")).toBe("oldName();\n");
  });
});
