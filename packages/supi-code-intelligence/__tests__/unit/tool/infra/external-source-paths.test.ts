import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { setWorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerCodeIntelligenceTools } from "../../../../src/tool/register.ts";
import { sessionCache } from "../../../helpers/execute-action.ts";
import { clearMockRuntime, registerMockProvider } from "../../../helpers/register-mock-runtime.ts";

let root: string;
let cwd: string;
let file: string;
let alias: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "external-source-output-"));
  cwd = join(root, "workspace");
  mkdirSync(cwd);
  file = join(realpathSync(root), "source.ts");
  alias = join(root, "source-link.ts");
  writeFileSync(file, "export function widget() {\n  work();\n}\n");
  symlinkSync(file, alias);
  symlinkSync(root, join(root, "source-dir-link"), "dir");
  registerMockProvider(cwd, {
    workspaceSymbols: async () =>
      completedCodeQuery([
        {
          name: "widget",
          kind: "Function",
          file: alias,
          declarationAnchor: { line: 1, character: 1 },
          nameAnchor: { line: 1, character: 17 },
          container: null,
        },
      ]),
    nodeAt: async () => ({
      kind: "partial",
      file: alias,
      reason: "Recovered node",
      errorRanges: [],
      data: {
        type: "identifier",
        text: "widget",
        startLine: 1,
        startCharacter: 17,
        endLine: 1,
        endCharacter: 23,
        ancestry: [],
      },
    }),
    definition: async () => ({
      kind: "partial",
      reason: "Partial definitions",
      data: [
        {
          uri: pathToFileURL(alias).href,
          range: { start: { line: 0, character: 16 }, end: { line: 0, character: 22 } },
        },
      ],
    }),
    callSites: async () => ({
      kind: "success",
      data: [{ name: "work", startLine: 2, startCharacter: 3, endLine: 2, endCharacter: 7 }],
    }),
    refactor: async () => ({
      kind: "precise",
      edits: {
        edits: [
          {
            file: join(root, "source-dir-link", "source.ts"),
            range: { start: { line: 0, character: 16 }, end: { line: 0, character: 22 } },
            newText: "gadget",
          },
        ],
      },
      authorizedMutationRoots: [root],
    }),
    calleesAt: async () => ({
      kind: "partial",
      file: alias,
      reason: "Recovered syntax",
      errorRanges: [{ start: { line: 2, character: 0 }, end: { line: 2, character: 1 } }],
      data: {
        enclosingScope: { name: "widget", startLine: 1, endLine: 3 },
        callees: [{ name: "work", startLine: 2, startCharacter: 3 }],
        depth: "direct",
      },
    }),
  });
});

afterEach(() => {
  clearMockRuntime();
  rmSync(root, { recursive: true, force: true });
});

interface RegisteredTool {
  outputSchema: TSchema;
  execute(...args: unknown[]): Promise<{
    content: Array<{ type: string; text?: string }>;
    structuredContent: unknown;
    details: unknown;
  }>;
}

const anchor = () => ({ file: alias, line: 1, character: 17 });
const cases = [
  {
    label: "resolve",
    name: "code_resolve",
    kind: "resolved",
    input: () => ({ target: { anchor: anchor() } }),
  },
  {
    label: "orientation",
    name: "code_orientation",
    kind: "completed",
    input: () => ({ focus: { target: { anchor: anchor() } } }),
  },
  ...["code_resolve", "code_orientation", "code_graph"].map((name) => ({
    label: `${name} candidates`,
    name,
    kind: "disambiguation",
    input: () =>
      name === "code_orientation"
        ? { focus: { target: { symbol: { query: "widget" } } }, maxResults: 1 }
        : { target: { symbol: { query: "widget" } }, maxResults: 1 },
  })),
  {
    label: "graph recovery",
    name: "code_graph",
    kind: "completed",
    input: () => ({ target: { anchor: anchor() }, relations: ["callees"] }),
  },
  {
    label: "semantic search",
    name: "code_find",
    kind: "completed",
    input: () => ({ query: "widget", mode: "semantic", scope: [alias] }),
  },
  {
    label: "refactor preview",
    name: "code_refactor_plan",
    kind: "completed",
    input: () => ({
      operation: { rename_symbol: { target: { anchor: anchor() }, newName: "gadget" } },
    }),
  },
  {
    label: "AST search",
    name: "code_find",
    kind: "completed",
    input: () => ({ query: "work", mode: "ast", kind: "call", scope: [alias] }),
  },
];

describe("registered code-tool external source paths", () => {
  it.each([false, true])(
    "groups equivalent recovery warnings without hiding distinct observations (distinct export: %s)",
    async (distinctExport) => {
      const reason = "Tree-sitter recovered syntax; structural evidence may be incomplete.";
      const recovery = {
        kind: "partial" as const,
        file: alias,
        reason,
        errorRanges: [{ start: { line: 2, character: 0 }, end: { line: 2, character: 1 } }],
      };
      registerMockProvider(cwd, {
        nodeAt: async () => ({
          ...recovery,
          data: {
            type: "identifier",
            text: "widget",
            startLine: 1,
            startCharacter: 17,
            endLine: 1,
            endCharacter: 23,
            ancestry: [],
          },
        }),
        outline: async () => ({ ...recovery, data: [] }),
        imports: async () => ({ ...recovery, data: [] }),
        exports: async () => ({
          ...recovery,
          reason: distinctExport ? "Export recovery!" : reason,
          data: [],
        }),
      });
      const pi = createPiMock();
      registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
      const tool = getTool(pi, "code_orientation") as unknown as RegisteredTool;
      const result = await tool.execute(
        "recovery",
        { focus: { target: { anchor: anchor() } } },
        undefined,
        undefined,
        makeCtx({ cwd }),
      );
      expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
      expect(result.structuredContent).toMatchObject({
        sections: expect.arrayContaining([
          expect.objectContaining({
            key: "defs",
            status: "partial",
            facts: expect.objectContaining({
              recovery: ["nodeAt", "outline", "imports", "exports"].map((operation) =>
                expect.objectContaining({ operation, file, errorRanges: recovery.errorRanges }),
              ),
            }),
          }),
        ]),
      });
      const text = result.content.map((block) => block.text ?? "").join("\n");
      const operations = distinctExport
        ? "nodeAt, outline, imports"
        : "nodeAt, outline, imports, exports";
      const warning = `Partial ${operations} evidence in \`${file}\`: ${reason} Errors: L3:1.`;
      expect(text).toContain(warning);
      expect(text.split("\n").filter((line) => line.startsWith("Partial "))).toHaveLength(
        distinctExport ? 2 : 1,
      );
      expect(text).not.toContain("incomplete..");
      expect(text).not.toContain("recovery!.");
      expect(result.details).toMatchObject({
        displaySections: expect.arrayContaining([
          expect.objectContaining({
            key: "orientation.defs",
            lines: expect.arrayContaining([warning]),
          }),
        ]),
      });
    },
  );
  it.each(["code_find", "code_resolve", "code_graph", "code_orientation"])(
    "distinguishes an excluded observed alias from a retained canonical match in %s",
    async (name) => {
      registerMockProvider(cwd, {
        workspaceSymbols: async () => ({
          kind: "partial",
          data: [
            {
              name: "widget",
              kind: "Function",
              file,
              declarationAnchor: { line: 1, character: 1 },
              nameAnchor: { line: 1, character: 17 },
            },
          ],
          reason: "Index warming; Automatic path policy excluded 1 workspace-symbol result.",
          metadata: { automaticPathExclusion: { excludedCount: 1, examples: [alias] } },
        }),
      });
      const pi = createPiMock();
      registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
      const tool = getTool(pi, name) as unknown as RegisteredTool;
      const symbol = { query: "widget" };
      const input =
        name === "code_find"
          ? { query: "widget", mode: "semantic", scope: [file] }
          : name === "code_orientation"
            ? { focus: { target: { symbol } } }
            : { target: { symbol } };
      const result = await tool.execute(
        "excluded-alias",
        input,
        undefined,
        undefined,
        makeCtx({ cwd }),
      );
      expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
      const explanation = `observed \`${alias}\` → canonical \`${file}\``;
      const markdown = result.content.map((block) => block.text ?? "").join("\n");
      expect(markdown).toContain(explanation);
      expect(JSON.stringify(result.details)).toContain(explanation);
      if (name === "code_find") {
        expect(result.structuredContent).toMatchObject({
          matches: [expect.objectContaining({ file })],
          automaticPathExclusion: {
            excludedCount: 1,
            examples: [{ observedPath: alias, canonicalPath: file }],
          },
          partialReason: expect.stringContaining("Index warming"),
          evidenceLists: [
            expect.objectContaining({
              totalCount: null,
              shownCount: 1,
              partialReason: "provider-limited",
            }),
          ],
        });
      } else {
        expect(result.structuredContent).toMatchObject({
          kind: "disambiguation",
          evidenceLists: [
            expect.objectContaining({
              totalCount: null,
              shownCount: 1,
              partialMessage: expect.stringContaining(explanation),
            }),
          ],
        });
      }
    },
  );

  it("retains non-file definition observations while disclosing unavailable filesystem navigation", async () => {
    const uri = "jdt://contents/library/example.class";
    registerMockProvider(cwd, {
      definition: async () =>
        completedCodeQuery([
          { uri, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } } },
        ]),
    });
    const pi = createPiMock();
    registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, "code_orientation") as unknown as RegisteredTool;
    const result = await tool.execute(
      "virtual",
      { focus: { target: { anchor: anchor() } } },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );
    expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
    expect(result.structuredContent).toMatchObject({
      sections: expect.arrayContaining([
        expect.objectContaining({
          key: "defs",
          facts: expect.objectContaining({
            contextDefinitions: {
              status: "complete",
              reason: null,
              collectedCount: 1,
              omittedCount: 0,
              entries: [
                {
                  uri,
                  navigation: "unavailable",
                  reason: expect.any(String),
                  range: expect.any(Object),
                },
              ],
            },
          }),
        }),
      ]),
    });
    expect(result.content.map((block) => block.text ?? "").join("\n")).toContain(
      "filesystem navigation unavailable",
    );
    expect(JSON.stringify(result.structuredContent)).not.toContain("jdt:/contents");
  });

  it("canonicalizes instruction navigation without changing directory surfacing identity", async () => {
    mkdirSync(join(cwd, "rules"));
    writeFileSync(
      join(cwd, "rules/main.md"),
      Array.from({ length: 201 }, (_, index) => `Rule ${index}`).join("\n"),
    );
    symlinkSync(join(cwd, "rules/main.md"), join(cwd, "AGENTS.md"));
    const pi = createPiMock();
    registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, "code_orientation") as unknown as RegisteredTool;
    const result = await tool.execute(
      "instructions",
      { focus: { path: "." } },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );
    expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
    expect(result.structuredContent).toMatchObject({
      instructions: [expect.objectContaining({ path: "rules/main.md", truncated: true })],
    });
    expect(result.details).toMatchObject({
      data: {
        instructions: {
          files: [expect.objectContaining({ path: "rules/main.md", directory: "." })],
        },
      },
    });
    const text = result.content.map((block) => block.text ?? "").join("\n");
    expect(text).toContain("Read `rules/main.md`");
    expect(text).not.toContain("Read `AGENTS.md`");
    const second = await tool.execute(
      "same-directory",
      { focus: { path: "." } },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );
    expect(second.structuredContent).toMatchObject({ instructions: [] });
  });
  it.each([true, false])(
    "normalizes file focus without rewriting symbol coordinates (inside workspace: %s)",
    async (inside) => {
      const point = inside ? join(cwd, "index.ts") : alias;
      if (inside) writeFileSync(point, "export const value = 1;\n");
      const expected = inside ? "index.ts" : file;
      setWorkspaceLspRuntimeState(cwd, {
        kind: "unavailable",
        reason: "No semantic diagnostics in fixture",
      });
      const pi = createPiMock();
      registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
      const tool = getTool(pi, "code_orientation") as unknown as RegisteredTool;
      const result = await tool.execute(
        "file",
        { focus: { path: point } },
        undefined,
        undefined,
        makeCtx({ cwd }),
      );
      expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
      expect(result.structuredContent).toMatchObject({
        kind: "completed",
        focusKind: "file",
        focus: expected,
      });
      expect(result.details).toMatchObject({ data: { focusTarget: expected } });
      expect(result.content.map((block) => block.text ?? "").join("\n")).toContain(expected);
    },
  );
  it.each([true, false])(
    "normalizes directory focus and navigation (inside workspace: %s)",
    async (inside) => {
      const directory = join(inside ? cwd : root, "directory");
      mkdirSync(directory);
      writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "directory-project" }));
      writeFileSync(join(directory, "index.ts"), "export const value = 1;\n");
      const expected = inside ? "directory" : realpathSync(directory);
      const pi = createPiMock();
      registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
      const tool = getTool(pi, "code_orientation") as unknown as RegisteredTool;
      const result = await tool.execute(
        "directory",
        { focus: { path: directory } },
        undefined,
        undefined,
        makeCtx({ cwd }),
      );
      expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
      expect(result.structuredContent).toMatchObject({
        kind: "completed",
        focus: expected,
        workspace: { focus: expected },
      });
      expect(result.details).toMatchObject({ data: { focusTarget: expected } });
      const text = result.content.map((block) => block.text ?? "").join("\n");
      expect(text).toContain(`Directory Orientation: \`${expected}\``);
      expect(text).toContain(`${expected}/package.json`);
      expect(text).not.toContain("../directory");
    },
  );
  it.each(cases)(
    "uses canonical external paths in $label across all output surfaces",
    async (testCase) => {
      if (testCase.kind === "disambiguation") {
        registerMockProvider(cwd, {
          workspaceSymbols: async () =>
            completedCodeQuery(
              ["widgetOne", "widgetTwo"].map((name) => ({
                name,
                kind: "Function",
                file: alias,
                declarationAnchor: { line: 1, character: 1 },
                nameAnchor: { line: 1, character: 17 },
                container: null,
              })),
            ),
        });
      }
      const pi = createPiMock();
      registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
      const tool = getTool(pi, testCase.name) as unknown as RegisteredTool;
      const result = await tool.execute(
        testCase.label,
        testCase.input(),
        undefined,
        undefined,
        makeCtx({ cwd }),
      );
      expect(result.structuredContent).toMatchObject({ kind: testCase.kind });
      expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
      if (testCase.label === "orientation") {
        expect(result.structuredContent).toMatchObject({
          sections: expect.arrayContaining([
            expect.objectContaining({
              key: "defs",
              status: "partial",
              facts: expect.objectContaining({
                recovery: [expect.objectContaining({ file, reason: "Recovered node" })],
                contextDefinitions: expect.objectContaining({
                  status: "partial",
                  entries: [expect.objectContaining({ file })],
                }),
              }),
            }),
          ]),
        });
      }
      const markdown = result.content
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("\n");
      expect(markdown).toContain(file);
      expect(JSON.stringify(result.structuredContent)).toContain(file);
      expect(JSON.stringify(result.details)).toContain(file);
      for (const output of [
        markdown,
        JSON.stringify(result.structuredContent),
        JSON.stringify(result.details),
      ]) {
        expect(output).not.toContain(alias);
        expect(output).not.toContain("../source-link.ts");
      }
    },
  );
});
