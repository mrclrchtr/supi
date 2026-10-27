import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { completedCodeQuery, unavailableCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { setWorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerCodeIntelligenceTools } from "../../../../src/tool/register.ts";
import { sessionCache } from "../../../helpers/execute-action.ts";
import { clearMockRuntime, registerMockProvider } from "../../../helpers/register-mock-runtime.ts";

let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "orientation-structured-"));
  writeFileSync(join(cwd, "index.ts"), "export const value = 1;\n");
  registerMockProvider(cwd);
});
afterEach(() => {
  clearMockRuntime();
  rmSync(cwd, { recursive: true, force: true });
});

interface StructuredTool {
  outputSchema: TSchema;
  execute: (
    ...args: unknown[]
  ) => Promise<{ content: Array<{ text: string }>; structuredContent: Record<string, unknown> }>;
}

function tool(): StructuredTool {
  const pi = createPiMock();
  registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
  return getTool(pi, "code_orientation") as unknown as StructuredTool;
}

async function execute(registered: StructuredTool, params: unknown, signal?: AbortSignal) {
  const result = await registered.execute(
    "orientation",
    params,
    signal,
    undefined,
    makeCtx({ cwd }),
  );
  expect(
    Value.Check(registered.outputSchema, result.structuredContent),
    JSON.stringify([...Value.Errors(registered.outputSchema, result.structuredContent)]),
  ).toBe(true);
  expect(JSON.parse(JSON.stringify(result.structuredContent))).toEqual(result.structuredContent);
  return result;
}

function readyLsp(diagnostics: unknown[] = [], current = true) {
  setWorkspaceLspRuntimeState(cwd, {
    kind: "ready",
    runtime: {
      waitUntilReadyForFile: async () => ({ kind: "ready" }),
      waitUntilReadyForWorkspace: async () => ({ kind: "ready" }),
      getProjectServers: () => [
        {
          name: "test",
          root: cwd,
          fileTypes: ["ts"],
          status: "running",
          openFiles: [],
          ready: true,
        },
      ],
      getOutstandingDiagnosticSummary: () => ({
        current,
        entries: [{ file: "index.ts", total: 2, errors: 1, warnings: 1 }],
      }),
      fileDiagnostics: async () => completedCodeQuery(diagnostics),
    } as never,
  });
}

describe("orientation structured results", () => {
  it("returns typed workspace inventory independent of the text budget", async () => {
    const longName = `description-${"long ".repeat(5000)}`;
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ name: "fixture", description: longName }),
    );
    const registered = tool();
    const result = await registered.execute(
      "workspace",
      { maxResults: 10 },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );
    const data = result.structuredContent;
    expect(data).toMatchObject({
      kind: "completed",
      workspace: {
        directFiles: [
          { path: "index.ts", kind: "file" },
          { path: "package.json", kind: "file" },
        ],
        containingProjects: [{ name: "fixture", description: longName }],
      },
    });
    expect(result.content[0]?.text).not.toContain(longName);
    expect(data.snapshot).toMatchObject({
      path: expect.any(String),
      limitation: expect.stringContaining("does not refresh"),
    });
    expect(Value.Check(registered.outputSchema, data)).toBe(true);
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });

  it("keeps caller-limited workspace records when the text budget is exceeded", async () => {
    for (let index = 0; index < 12; index++)
      writeFileSync(join(cwd, `file-${String(index).padStart(2, "0")}.ts`), "");
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ name: "fixture", description: "x".repeat(50_000) }),
    );
    const result = await execute(tool(), { maxResults: 5 });
    const workspace = result.structuredContent.workspace as {
      directFiles: unknown[];
      selections: unknown[];
    };
    expect(workspace.directFiles).toHaveLength(5);
    expect(workspace.selections).toContainEqual(
      expect.objectContaining({
        key: "workspace.files",
        totalCount: 14,
        shownCount: 5,
        omittedCount: 9,
      }),
    );
    expect(result.structuredContent.sections).toContainEqual(
      expect.objectContaining({
        key: "workspace.files",
        evidenceLists: [
          expect.objectContaining({ totalCount: 14, shownCount: 5, omittedCount: 9 }),
        ],
      }),
    );
  });

  it("reports invalid input and bounded candidate outcomes", async () => {
    registerMockProvider(cwd, {
      workspaceSymbols: async () =>
        completedCodeQuery([
          {
            name: "value",
            kind: "Variable",
            file: join(cwd, "index.ts"),
            declarationAnchor: { line: 1, character: 1 },
            nameAnchor: { line: 1, character: 14 },
          },
          {
            name: "valueOther",
            kind: "Variable",
            file: join(cwd, "index.ts"),
            declarationAnchor: { line: 1, character: 1 },
            nameAnchor: { line: 1, character: 14 },
          },
        ]),
    });
    const registered = tool();
    const invalid = await execute(registered, { focus: { path: "missing" } });
    expect(invalid.structuredContent).toMatchObject({
      kind: "invalid-input",
      message: expect.any(String),
    });
    mkdirSync(join(cwd, "real"));
    symlinkSync(join(cwd, "real"), join(cwd, "link"));
    const link = await execute(registered, { focus: { path: "link" } });
    expect(link.structuredContent).toMatchObject({
      kind: "invalid-input",
      symlinkRejection: { requestedPath: expect.any(String), blockedPath: expect.any(String) },
    });
    for (const symbolKind of [undefined, "class"]) {
      const result = await execute(registered, {
        focus: { target: { symbol: { query: "value", ...(symbolKind ? { symbolKind } : {}) } } },
        maxResults: 1,
      });
      expect(result.structuredContent).toMatchObject({
        kind: symbolKind ? "kind-mismatch" : "disambiguation",
        candidates: [{ handle: expect.stringMatching(/^tg-/), name: "value" }],
        evidenceLists: [{ totalCount: 2, shownCount: 1, omittedCount: 1 }],
      });
    }
  });

  it("preserves unknown candidate remainder when semantic discovery is partial", async () => {
    registerMockProvider(cwd, {
      workspaceSymbols: async () => ({
        kind: "partial",
        reason: "index warming",
        data: ["value", "valueOther"].map((name) => ({
          name,
          kind: "Variable",
          file: join(cwd, "index.ts"),
          declarationAnchor: { line: 1, character: 1 },
          nameAnchor: { line: 1, character: 14 },
        })),
      }),
    });
    const registered = tool();
    const result = await execute(registered, {
      focus: { target: { symbol: { query: "value" } } },
      maxResults: 1,
    });
    expect(result.structuredContent).toMatchObject({
      kind: "disambiguation",
      evidenceLists: [
        {
          totalCount: null,
          shownCount: 1,
          omittedCount: 1,
          partialReason: "provider-limited",
          partialMessage: "index warming",
        },
      ],
    });
    const missingKind = { ...result.structuredContent };
    delete missingKind.kind;
    expect(Value.Check(registered.outputSchema, missingKind)).toBe(false);
  });

  it("returns directory and module declarations, instruction snippets and Gradle evidence", async () => {
    mkdirSync(join(cwd, "packages/a"), { recursive: true });
    mkdirSync(join(cwd, "packages/b"), { recursive: true });
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
    );
    writeFileSync(
      join(cwd, "packages/a/package.json"),
      JSON.stringify({ name: "a", main: "./index.js", dependencies: { b: "workspace:*" } }),
    );
    writeFileSync(join(cwd, "packages/b/package.json"), JSON.stringify({ name: "b" }));
    writeFileSync(join(cwd, "packages/a/CLAUDE.md"), "Local instructions\n");
    sessionCache.getOrCreate(cwd).setGradleObserver({
      observe: async (root) => ({
        selectedRoot: root,
        query: "GradleBuild/BasicGradleProject",
        status: "complete",
        runtime: {
          kind: "distribution",
          value: "wrapper-runtime-private-value",
          source: "gradle-wrapper.properties",
          version: "8.9",
        },
        gradleVersion: "8.9",
        buildRoot: root,
        projects: [
          {
            buildRoot: root,
            path: ":a",
            name: "a",
            directory: join(cwd, "packages/a"),
            parentPath: ":",
          },
          {
            buildRoot: root,
            path: ":b",
            name: "b",
            directory: join(cwd, "packages/b"),
            parentPath: ":",
          },
        ],
        includedBuilds: [{ buildRoot: "/included" }],
      }),
    });
    const registered = tool();
    const module = await execute(registered, { focus: { module: "a" }, maxResults: 1 });
    expect(module.structuredContent).toMatchObject({
      kind: "completed",
      focusKind: "module",
      instructions: [{ path: "packages/a/CLAUDE.md", content: "Local instructions" }],
      workspace: {
        containingProjects: [{ name: "a" }],
        declaredPaths: [
          {
            projectId: "packages/a/package.json",
            paths: [{ fields: ["main"], path: "./index.js" }],
          },
        ],
        dependencies: [
          {
            projectId: "packages/a/package.json",
            field: "dependencies",
            name: "b",
            value: "workspace:*",
          },
        ],
        relationships: [
          {
            from: "packages/a/package.json",
            to: "packages/b/package.json",
            field: "dependencies",
            value: "workspace:*",
          },
        ],
        gradle: {
          status: "complete",
          projects: [{ path: ":a" }],
          includedBuilds: [{ buildRoot: "/included" }],
        },
      },
      sections: expect.arrayContaining([
        expect.objectContaining({
          key: "gradle.projects",
          evidenceLists: [expect.objectContaining({ shownCount: 1, omittedCount: 1 })],
        }),
      ]),
    });
    expect(JSON.stringify(module.structuredContent)).not.toContain("wrapper-runtime-private-value");
    const directory = await execute(registered, { focus: { path: "packages/b" } });
    expect(directory.structuredContent).toMatchObject({
      kind: "completed",
      focusKind: "directory",
      workspace: { containingProjects: [{ name: "b" }] },
    });
  });

  it("uses the same project, membership and grouped-path selections for text and native facts", async () => {
    mkdirSync(join(cwd, "packages/a"), { recursive: true });
    mkdirSync(join(cwd, "packages/b"), { recursive: true });
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
    );
    writeFileSync(
      join(cwd, "packages/a/package.json"),
      JSON.stringify({ name: "a", main: "./same.js", module: "./same.js", types: "./types.d.ts" }),
    );
    writeFileSync(join(cwd, "packages/b/package.json"), JSON.stringify({ name: "b" }));
    const registered = tool();
    const parent = await execute(registered, { focus: { path: "packages" }, maxResults: 1 });
    expect(parent.structuredContent).toMatchObject({
      workspace: {
        projects: [{ name: "a" }],
        memberships: [{ projectId: "packages/a/package.json" }],
        selections: expect.arrayContaining([
          expect.objectContaining({
            key: "workspace.projects",
            totalCount: 2,
            shownCount: 1,
            omittedCount: 1,
          }),
          expect.objectContaining({
            key: "workspace.memberships",
            totalCount: 2,
            shownCount: 1,
            omittedCount: 1,
          }),
        ]),
      },
      sections: expect.arrayContaining([
        expect.objectContaining({
          key: "workspace.projects",
          evidenceLists: [
            expect.objectContaining({ totalCount: 2, shownCount: 1, omittedCount: 1 }),
          ],
        }),
        expect.objectContaining({
          key: "workspace.memberships",
          evidenceLists: [
            expect.objectContaining({ totalCount: 2, shownCount: 1, omittedCount: 1 }),
          ],
        }),
      ]),
    });
    expect(parent.content[0]?.text).toContain("showing 1 of 2; 1 omitted");
    const child = await execute(registered, { focus: { path: "packages/a" }, maxResults: 1 });
    expect(child.structuredContent).toMatchObject({
      workspace: {
        declaredPaths: [
          {
            projectId: "packages/a/package.json",
            paths: [{ path: "./same.js", fields: ["main", "module"] }],
          },
        ],
        selections: expect.arrayContaining([
          expect.objectContaining({
            key: "packages/a/package.json.paths",
            totalCount: 2,
            shownCount: 1,
            omittedCount: 1,
          }),
        ]),
      },
    });
    const snapshot = child.structuredContent.snapshot as { path: string };
    expect(readFileSync(snapshot.path, "utf8")).toContain("./same.js");
  });

  it("shares incomplete metadata status without making the complete inventory partial", async () => {
    writeFileSync(join(cwd, "package.json"), "{ malformed");
    const result = await execute(tool(), {});
    expect(result.structuredContent).toMatchObject({
      workspace: {
        collection: { status: "partial" },
        selections: expect.arrayContaining([
          expect.objectContaining({ key: "workspace.files", totalCount: 2, partialReason: null }),
          expect.objectContaining({
            key: "workspace.projects",
            totalCount: null,
            partialReason: "configuration-error",
          }),
        ]),
      },
      sections: expect.arrayContaining([
        expect.objectContaining({ key: "workspace.files", status: "complete" }),
        expect.objectContaining({
          key: "workspace.projects",
          status: "partial",
          reason: "Metadata collection is incomplete",
          evidenceLists: [
            expect.objectContaining({ totalCount: null, partialReason: "configuration-error" }),
          ],
        }),
      ]),
    });
  });

  it("retains a blocked Gradle observation without inventing projects", async () => {
    sessionCache.getOrCreate(cwd).setGradleObserver({
      observe: async (root) => ({
        selectedRoot: root,
        query: "GradleBuild/BasicGradleProject",
        status: "blocked",
        stage: "authorization",
        reason: "not authorized",
      }),
    });
    const result = await execute(tool(), {});
    expect(result.structuredContent).toMatchObject({
      workspace: {
        gradle: { status: "blocked", stage: "authorization", reason: "not authorized" },
      },
      sections: expect.arrayContaining([
        expect.objectContaining({ key: "gradle.observation", status: "unavailable" }),
      ]),
    });
    expect(
      (result.structuredContent.workspace as { gradle: Record<string, unknown> }).gradle,
    ).not.toHaveProperty("projects");
  });

  it("preserves selected file structural facts and invalidated diagnostic snapshot", async () => {
    const item = {
      name: "value",
      kind: "variable",
      startLine: 1,
      startCharacter: 14,
      endLine: 1,
      endCharacter: 19,
    };
    registerMockProvider(cwd, {
      outline: async () => ({
        kind: "partial",
        file: "index.ts",
        reason: "recovered",
        errorRanges: [{ start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }],
        data: [item, { ...item, name: "other" }],
      }),
      imports: async () => ({
        kind: "success",
        data: [
          {
            moduleSpecifier: "example",
            startLine: 1,
            startCharacter: 1,
            endLine: 1,
            endCharacter: 3,
          },
        ],
      }),
      exports: async () => ({ kind: "success", data: [item] }),
    });
    readyLsp([], false);
    const result = await execute(tool(), { focus: { path: "index.ts" }, maxResults: 1 });
    expect(result.structuredContent).toMatchObject({
      focusKind: "file",
      sections: expect.arrayContaining([
        expect.objectContaining({ key: "filesystem.file", facts: { fileSizeBytes: 24 } }),
        expect.objectContaining({
          key: "structural.outline",
          status: "partial",
          facts: { outline: [item] },
          evidenceLists: [
            expect.objectContaining({
              totalCount: null,
              shownCount: 1,
              omittedCount: 1,
              partialReason: "provider-limited",
            }),
          ],
        }),
        expect.objectContaining({
          key: "structural.imports",
          facts: { imports: [expect.objectContaining({ moduleSpecifier: "example" })] },
        }),
        expect.objectContaining({ key: "structural.exports", facts: { exports: [item] } }),
        expect.objectContaining({
          key: "diagnostics.snapshot",
          facts: {
            snapshotCurrent: false,
            diagnosticSnapshot: [expect.objectContaining({ file: "index.ts", errors: 1 })],
          },
        }),
      ]),
    });
  });

  it("returns symbol source, definitions, documentation and diagnostics without store internals", async () => {
    writeFileSync(join(cwd, "index.ts"), "/** Widget docs. */\nexport function widget() {}\n");
    const range = { start: { line: 1, character: 16 }, end: { line: 1, character: 22 } };
    registerMockProvider(cwd, {
      hover: async () => completedCodeQuery({ contents: "function widget(): void", range }),
      definition: async () =>
        completedCodeQuery([{ uri: pathToFileURL(join(cwd, "index.ts")).href, range }]),
      nodeAt: async () => ({
        kind: "success",
        data: {
          type: "identifier",
          text: "widget",
          startLine: 2,
          startCharacter: 17,
          endLine: 2,
          endCharacter: 23,
          ancestry: [],
        },
      }),
      outline: async () => ({
        kind: "success",
        data: [
          {
            name: "widget",
            kind: "function",
            startLine: 2,
            startCharacter: 1,
            endLine: 2,
            endCharacter: 28,
          },
        ],
      }),
      imports: async () => ({ kind: "success", data: [] }),
      exports: async () => ({ kind: "success", data: [] }),
    });
    readyLsp([{ range, severity: 2, message: "warning", source: "fixture", code: 42 }]);
    const result = await execute(tool(), {
      focus: { target: { anchor: { file: "index.ts", line: 2, character: 17 } } },
    });
    expect(result.structuredContent).toMatchObject({
      kind: "completed",
      focusKind: "symbol",
      targets: [{ handle: expect.stringMatching(/^tg-/), name: "widget" }],
      sections: expect.arrayContaining([
        expect.objectContaining({
          key: "defs",
          facts: expect.objectContaining({
            node: expect.objectContaining({ type: "identifier", text: "widget" }),
            hover: expect.objectContaining({ contents: "function widget(): void" }),
            definitions: [{ file: "index.ts", range }],
            contextDefinitions: {
              status: "complete",
              reason: null,
              entries: [{ uri: pathToFileURL(join(cwd, "index.ts")).href, range }],
              collectedCount: 1,
              omittedCount: 0,
            },
            sourceContext: expect.objectContaining({
              outline: expect.objectContaining({
                status: "complete",
                entries: [{ name: "widget", kind: "function", startLine: 2, endLine: 2 }],
              }),
              imports: expect.objectContaining({ status: "complete", entries: [] }),
            }),
          }),
        }),
        expect.objectContaining({ key: "docs", facts: { documentation: ["Widget docs."] } }),
        expect.objectContaining({
          key: "diagnostics",
          facts: {
            diagnostics: [{ range, severity: 2, message: "warning", source: "fixture", code: 42 }],
          },
        }),
      ]),
      readNext: [expect.objectContaining({ file: "index.ts" })],
    });
    expect(JSON.stringify(result.structuredContent)).not.toMatch(
      /fileFingerprint|spanId|operationId/,
    );
  });

  it.each(["empty", "unavailable", "partial", "failed"] as const)(
    "reports independent hover and context-definition observations: %s",
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one fixture exercises four independent provider outcomes
    async (mode) => {
      let definitions = 0;
      registerMockProvider(cwd, {
        nodeAt: async () => ({
          kind: "unsupported-language",
          file: "index.ts",
          message: "node unsupported",
        }),
        outline: async () => ({ kind: "success", data: [] }),
        imports: async () => ({ kind: "success", data: [] }),
        exports: async () => ({ kind: "success", data: [] }),
        hover: async () => {
          if (mode === "failed") throw new Error("hover failure");
          if (mode === "unavailable") return unavailableCodeQuery("hover offline");
          if (mode === "partial")
            return { kind: "partial", reason: "hover incomplete", data: null };
          return completedCodeQuery(null);
        },
        definition: async () => {
          if (++definitions > 1) return completedCodeQuery([]);
          if (mode === "failed") throw new Error("definition failure");
          if (mode === "unavailable") return unavailableCodeQuery("definition offline");
          if (mode === "partial")
            return { kind: "partial", reason: "definition incomplete", data: [] };
          return completedCodeQuery([]);
        },
      });
      readyLsp();
      const result = await execute(tool(), {
        focus: { target: { anchor: { file: "index.ts", line: 1, character: 14 } } },
      });
      const section = (
        result.structuredContent.sections as Array<{
          key: string;
          status: string;
          facts: Record<string, unknown>;
        }>
      ).find((entry) => entry.key === "defs");
      expect(section?.status).toBe("complete");
      const status = mode === "empty" ? "complete" : mode === "partial" ? "partial" : "unavailable";
      const hoverReason =
        mode === "empty"
          ? null
          : mode === "partial"
            ? "hover incomplete"
            : mode === "unavailable"
              ? "hover offline"
              : "Error: hover failure";
      const definitionReason =
        mode === "empty"
          ? null
          : mode === "partial"
            ? "definition incomplete"
            : mode === "unavailable"
              ? "definition offline"
              : "Error: definition failure";
      expect(section?.facts).toMatchObject({
        hover: null,
        hoverObservation: { status, reason: hoverReason },
        nodeObservation: { status: "unavailable", reason: "node unsupported" },
        contextDefinitions: {
          status,
          reason: definitionReason,
          ...(mode === "empty" || mode === "partial"
            ? { entries: [], collectedCount: 0, omittedCount: 0 }
            : {}),
        },
      });
      if (mode === "unavailable" || mode === "failed")
        expect(section?.facts.contextDefinitions).not.toHaveProperty("entries");
    },
  );

  it("retains partial context data and counts without claiming an exact provider total", async () => {
    const range = { start: { line: 0, character: 13 }, end: { line: 0, character: 18 } };
    let calls = 0;
    registerMockProvider(cwd, {
      nodeAt: async () => ({
        kind: "partial",
        file: "index.ts",
        reason: "recovered node",
        errorRanges: [range],
        data: {
          type: "identifier",
          text: "value",
          startLine: 1,
          startCharacter: 14,
          endLine: 1,
          endCharacter: 19,
          ancestry: [],
        },
      }),
      outline: async () => ({ kind: "success", data: [] }),
      imports: async () => ({ kind: "success", data: [] }),
      exports: async () => ({ kind: "success", data: [] }),
      hover: async () => ({
        kind: "partial",
        reason: "partial hover",
        data: { contents: "value: number" },
      }),
      definition: async () =>
        ++calls === 1
          ? {
              kind: "partial",
              reason: "partial definitions",
              data: [
                { uri: pathToFileURL(join(cwd, "index.ts")).href, range },
                { uri: pathToFileURL(join(cwd, "index.ts")).href, range },
              ],
            }
          : completedCodeQuery([]),
    });
    readyLsp();
    const registered = tool();
    const result = await execute(registered, {
      focus: { target: { anchor: { file: "index.ts", line: 1, character: 14 } } },
      maxResults: 1,
    });
    const section = (
      result.structuredContent.sections as Array<{ key: string; facts: Record<string, unknown> }>
    ).find((item) => item.key === "defs");
    expect(section?.facts).toMatchObject({
      nodeObservation: { status: "partial", reason: "recovered node" },
      hoverObservation: { status: "partial", reason: "partial hover" },
      hover: { contents: "value: number" },
      contextDefinitions: {
        status: "partial",
        reason: "partial definitions",
        collectedCount: 2,
        omittedCount: 1,
        entries: [{ range }],
      },
    });
    expect(section?.facts.contextDefinitions).not.toHaveProperty("totalCount");
    const malformed = structuredClone(result.structuredContent);
    const definitions = (
      malformed.sections as Array<{
        key: string;
        facts: { contextDefinitions?: { status: string } };
      }>
    ).find((item) => item.key === "defs")?.facts.contextDefinitions;
    if (!definitions) throw new Error("Missing context definitions");
    definitions.status = "complete";
    expect(Value.Check(registered.outputSchema, malformed)).toBe(false);
  });

  it("marks position-strict observations withheld for declaration anchors", async () => {
    registerMockProvider(cwd, {
      workspaceSymbols: async () =>
        completedCodeQuery([
          {
            name: "synthetic",
            kind: "Variable",
            file: join(cwd, "index.ts"),
            declarationAnchor: { line: 1, character: 1 },
          },
        ]),
      hover: async () => {
        throw new Error("hover must not run");
      },
      definition: async () => completedCodeQuery([]),
      outline: async () => ({ kind: "success", data: [] }),
      imports: async () => ({ kind: "success", data: [] }),
      exports: async () => ({ kind: "success", data: [] }),
    });
    readyLsp();
    const result = await execute(tool(), { focus: { target: { symbol: { query: "synthetic" } } } });
    expect(result.structuredContent).toMatchObject({
      targets: [{ anchorKind: "declaration" }],
      sections: expect.arrayContaining([
        expect.objectContaining({
          key: "defs",
          facts: expect.objectContaining({
            nodeObservation: {
              status: "withheld",
              reason: expect.stringContaining("declaration anchor"),
            },
            hoverObservation: {
              status: "withheld",
              reason: expect.stringContaining("declaration anchor"),
            },
            contextDefinitions: expect.objectContaining({ status: "complete", entries: [] }),
          }),
        }),
      ]),
    });
  });

  it("keeps collected instruction snippets when the text safety budget removes them", async () => {
    mkdirSync(join(cwd, "src"));
    const content = `instruction-${"x".repeat(70_000)}`;
    writeFileSync(join(cwd, "src/CLAUDE.md"), content);
    const result = await execute(tool(), { focus: { path: "src" } });
    expect(result.structuredContent.instructions).toEqual([
      expect.objectContaining({
        path: "src/CLAUDE.md",
        content,
        shownLines: 1,
        totalLines: 1,
        truncated: false,
      }),
    ]);
    expect(result.content[0]?.text).not.toContain(content);
  });

  it("keeps oversized structural data even when registered output text is truncated", async () => {
    const specifier = `fixture-${"x".repeat(70_000)}`;
    registerMockProvider(cwd, {
      imports: async () => ({
        kind: "success",
        data: [
          {
            moduleSpecifier: specifier,
            startLine: 1,
            startCharacter: 1,
            endLine: 1,
            endCharacter: 2,
          },
        ],
      }),
    });
    readyLsp();
    const result = await execute(tool(), { focus: { path: "index.ts" }, maxResults: 1 });
    expect(result.structuredContent).toMatchObject({
      sections: expect.arrayContaining([
        expect.objectContaining({
          key: "structural.imports",
          facts: { imports: [expect.objectContaining({ moduleSpecifier: specifier })] },
        }),
      ]),
    });
    expect(result.content[0]?.text).not.toContain(specifier);
  });

  it("keeps completed-empty and unavailable sections distinct", async () => {
    registerMockProvider(cwd, { imports: async () => ({ kind: "success", data: [] }) });
    readyLsp();
    const result = await execute(tool(), { focus: { path: "index.ts" } });
    expect(result.structuredContent).toMatchObject({
      sections: expect.arrayContaining([
        expect.objectContaining({
          key: "structural.imports",
          status: "complete",
          facts: { imports: [] },
          evidenceLists: [expect.objectContaining({ totalCount: 0, shownCount: 0 })],
        }),
        expect.objectContaining({
          key: "structural.exports",
          status: "unavailable",
          reason: expect.any(String),
        }),
      ]),
    });
  });

  it("propagates real collection failures", async () => {
    sessionCache.getOrCreate(cwd).setGradleObserver({
      observe: async () => {
        throw new Error("Gradle failure");
      },
    });
    await expect(
      tool().execute("failure", {}, undefined, undefined, makeCtx({ cwd })),
    ).rejects.toThrow("Gradle failure");
  });

  it("does not claim semantic observations when an earlier structural query fails", async () => {
    registerMockProvider(cwd, {
      nodeAt: async () => {
        throw new Error("structural failure");
      },
      hover: async () => completedCodeQuery({ contents: "not reached" }),
      definition: async () => completedCodeQuery([]),
    });
    readyLsp();
    const result = await execute(tool(), {
      focus: { target: { anchor: { file: "index.ts", line: 1, character: 14 } } },
    });
    expect(result.structuredContent).toMatchObject({
      sections: expect.arrayContaining([
        expect.objectContaining({
          key: "defs",
          status: "complete",
          facts: expect.objectContaining({
            nodeObservation: { status: "unavailable", reason: "Error: structural failure" },
            hoverObservation: {
              status: "unavailable",
              reason: "Not collected after nodeAt failed.",
            },
            contextDefinitions: {
              status: "unavailable",
              reason: "Not collected after nodeAt failed.",
            },
          }),
        }),
      ]),
    });
  });

  it("propagates cancellation during context gathering", async () => {
    const controller = new AbortController();
    registerMockProvider(cwd, {
      outline: async () => ({ kind: "success", data: [] }),
      imports: async () => ({ kind: "success", data: [] }),
      exports: async () => ({ kind: "success", data: [] }),
      hover: async () => {
        controller.abort(new Error("hover cancelled"));
        throw controller.signal.reason;
      },
    });
    readyLsp();
    await expect(
      tool().execute(
        "cancel-hover",
        { focus: { target: { anchor: { file: "index.ts", line: 1, character: 14 } } } },
        controller.signal,
        undefined,
        makeCtx({ cwd }),
      ),
    ).rejects.toThrow("hover cancelled");
  });

  it("propagates cancellation instead of returning observations", async () => {
    const signal = AbortSignal.abort(new Error("cancelled"));
    await expect(tool().execute("cancel", {}, signal, undefined, makeCtx({ cwd }))).rejects.toThrow(
      "cancelled",
    );
  });
});
