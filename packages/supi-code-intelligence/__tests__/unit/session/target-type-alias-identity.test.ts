import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SemanticProvider, StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCapabilityAdapter } from "../../../src/session/capability-adapter.ts";
import {
  getWorkflowTarget,
  registerWorkflowTarget,
  type TargetStoreEntry,
} from "../../../src/session/target-store.ts";
import {
  resolveTargetWorkflow,
  type TargetWorkflowDeps,
} from "../../../src/session/target-workflow.ts";

let cwd: string;
let file: string;
let store: Map<string, TargetStoreEntry>;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "target-type-alias-"));
  file = path.join(cwd, "sample.ts");
  writeFileSync(file, "export type UserId = string;\n");
  store = new Map();
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("type-alias Target identity", () => {
  it("merges exact semantic and structural observations before bounding the Target group", async () => {
    const outcome = await resolveTargetWorkflow(
      { file: "sample.ts" },
      { fileLevelAllowed: true, nameAnchorRequired: false, maxResults: 1 },
      workflowDeps(semanticProvider(), structuralProvider()),
    );

    expect(outcome).toMatchObject({
      kind: "target-group",
      confidence: "semantic",
      totalCount: 1,
      omittedCount: 0,
      targets: [
        {
          name: "UserId",
          kind: "Variable",
          confidence: "semantic",
          provenance: ["semantic", "structural"],
        },
      ],
    });
  });

  it.each(["file then symbol", "symbol then file"] as const)(
    "reuses one fully corroborated handle when resolving %s",
    async (order) => {
      const deps = workflowDeps(semanticProvider(), structuralProvider());
      const resolveFile = () =>
        resolveTargetWorkflow(
          { file: "sample.ts" },
          { fileLevelAllowed: true, nameAnchorRequired: false },
          deps,
        );
      const resolveSymbol = () =>
        resolveTargetWorkflow(
          { symbol: { query: "UserId" } },
          { fileLevelAllowed: false, nameAnchorRequired: false },
          deps,
        );

      const first = order === "file then symbol" ? await resolveFile() : await resolveSymbol();
      const second = order === "file then symbol" ? await resolveSymbol() : await resolveFile();
      const fileOutcome = order === "file then symbol" ? first : second;
      const symbolOutcome = order === "file then symbol" ? second : first;

      expect(fileOutcome.kind).toBe("target-group");
      expect(symbolOutcome.kind).toBe("resolved");
      if (fileOutcome.kind !== "target-group" || symbolOutcome.kind !== "resolved") return;
      expect(symbolOutcome.entry.targetId).toBe(fileOutcome.targets[0]?.targetId);
      expect(symbolOutcome.entry.provenance).toEqual(["semantic", "structural"]);
      expect(store).toHaveLength(1);
    },
  );

  it("reuses the file-discovery handle for anchored alias resolution", async () => {
    const deps = workflowDeps(semanticProvider(), structuralProvider());
    const fromFile = await resolveTargetWorkflow(
      { file: "sample.ts" },
      { fileLevelAllowed: true, nameAnchorRequired: false },
      deps,
    );
    const fromAnchor = await resolveTargetWorkflow(
      { anchor: { file: "sample.ts", line: 1, character: 13 } },
      { fileLevelAllowed: false, nameAnchorRequired: false },
      deps,
    );

    expect(fromFile.kind).toBe("target-group");
    expect(fromAnchor.kind).toBe("resolved");
    if (fromFile.kind !== "target-group" || fromAnchor.kind !== "resolved") return;
    expect(fromAnchor.entry.targetId).toBe(fromFile.targets[0]?.targetId);
    expect(fromAnchor.entry.provenance).toEqual(["semantic", "structural"]);
    expect(store).toHaveLength(1);
  });

  it("reuses the file member handle for an anchored same-name value declaration", async () => {
    writeFileSync(file, 'export type UserId = string; export let UserId = "x";\n');
    const deps = workflowDeps(collisionSemanticProvider(), collisionStructuralProvider());
    const fromFile = await resolveTargetWorkflow(
      { file: "sample.ts" },
      { fileLevelAllowed: true, nameAnchorRequired: false },
      deps,
    );
    const fromAnchor = await resolveTargetWorkflow(
      { anchor: { file: "sample.ts", line: 1, character: 41 } },
      { fileLevelAllowed: false, nameAnchorRequired: false },
      deps,
    );

    expect(fromFile.kind).toBe("target-group");
    expect(fromAnchor.kind).toBe("resolved");
    if (fromFile.kind !== "target-group" || fromAnchor.kind !== "resolved") return;
    const valueMember = fromFile.targets.find((target) => target.displayCharacter === 41);
    expect(fromAnchor.entry.targetId).toBe(valueMember?.targetId);
    expect(store).toHaveLength(2);
  });

  it("keeps same-name type and value declarations distinct across file and symbol resolution", async () => {
    writeFileSync(file, 'export type UserId = string; export let UserId = "x";\n');
    const deps = workflowDeps(collisionSemanticProvider(), collisionStructuralProvider());

    const fromFile = await resolveTargetWorkflow(
      { file: "sample.ts" },
      { fileLevelAllowed: true, nameAnchorRequired: false },
      deps,
    );
    const fromSymbol = await resolveTargetWorkflow(
      { symbol: { query: "UserId" } },
      { fileLevelAllowed: false, nameAnchorRequired: false },
      deps,
    );

    expect(fromFile.kind).toBe("target-group");
    expect(fromSymbol.kind).toBe("disambiguation");
    if (fromFile.kind !== "target-group" || fromSymbol.kind !== "disambiguation") return;
    expect(fromFile.totalCount).toBe(2);
    expect(fromFile.confidence).toBe("semantic");
    expect(fromFile.targets.map((target) => target.kind)).toEqual(["Variable", "Variable"]);
    expect(new Set(fromFile.targets.map((target) => target.targetId))).toHaveLength(2);
    expect(new Set(fromSymbol.candidates.map((candidate) => candidate.targetId))).toEqual(
      new Set(fromFile.targets.map((target) => target.targetId)),
    );
    expect(store).toHaveLength(2);
  });
});

function workflowDeps(
  semantic: SemanticProvider,
  structural: StructuralProvider,
): TargetWorkflowDeps {
  const capability = new TestCapabilityAdapter({ semantic, structural });
  return {
    cwd,
    capability,
    lookupTargetId: (targetId) => getWorkflowTarget(store, targetId),
    registerTarget: (input) => registerWorkflowTarget(store, cwd, input),
  };
}

function semanticProvider(): SemanticProvider {
  const symbol = {
    name: "UserId",
    kind: "Variable",
    file,
    declarationAnchor: { line: 1, character: 1 },
    nameAnchor: { line: 1, character: 13 },
    container: null,
    nesting: "top-level" as const,
  };
  return {
    documentSymbols: async () => [symbol],
    workspaceSymbols: async () => [symbol],
    references: async () => [],
    implementation: async () => [],
  };
}

function structuralProvider(): StructuralProvider {
  return {
    outline: async () => ({
      kind: "success",
      data: [
        {
          name: "UserId",
          kind: "type",
          startLine: 1,
          startCharacter: 8,
          endLine: 1,
          endCharacter: 29,
        },
      ],
    }),
    nodeAt: async () => typeAliasNode(),
    exports: async () => ({ kind: "success", data: [] }),
    imports: async () => ({ kind: "success", data: [] }),
    calleesAt: async () => ({ kind: "runtime-error", message: "unused" }),
    callSites: async () => ({ kind: "success", data: [] }),
  };
}

function collisionSemanticProvider(): SemanticProvider {
  const documentSymbols = [
    {
      name: "UserId",
      kind: "Variable",
      file,
      declarationAnchor: { line: 1, character: 1 },
      nameAnchor: { line: 1, character: 13 },
      container: null,
      nesting: "top-level" as const,
    },
    {
      name: "UserId",
      kind: "Variable",
      file,
      declarationAnchor: { line: 1, character: 41 },
      nameAnchor: { line: 1, character: 41 },
      container: null,
      nesting: "top-level" as const,
    },
  ];
  return {
    documentSymbols: async () => [...documentSymbols].reverse(),
    workspaceSymbols: async () =>
      documentSymbols.map(({ nameAnchor: _nameAnchor, ...symbol }) => symbol),
    references: async () => [],
    implementation: async () => [],
  };
}

function collisionStructuralProvider(): StructuralProvider {
  return {
    ...structuralProvider(),
    outline: async () => ({
      kind: "success",
      data: [
        {
          name: "UserId",
          kind: "type",
          startLine: 1,
          startCharacter: 8,
          endLine: 1,
          endCharacter: 29,
        },
        {
          name: "UserId",
          kind: "variable",
          startLine: 1,
          startCharacter: 41,
          endLine: 1,
          endCharacter: 54,
        },
      ],
    }),
    nodeAt: async (_file, _line, character) =>
      character === 13
        ? typeAliasNode()
        : {
            kind: "success",
            data: {
              type: "identifier",
              startLine: 1,
              startCharacter: 41,
              endLine: 1,
              endCharacter: 47,
              text: "UserId",
              ancestry: [
                {
                  type: "variable_declarator",
                  startLine: 1,
                  startCharacter: 41,
                  endLine: 1,
                  endCharacter: 54,
                },
              ],
            },
          },
  };
}

function typeAliasNode() {
  return {
    kind: "success" as const,
    data: {
      type: "type_identifier",
      startLine: 1,
      startCharacter: 13,
      endLine: 1,
      endCharacter: 19,
      text: "UserId",
      ancestry: [
        {
          type: "type_alias_declaration",
          startLine: 1,
          startCharacter: 8,
          endLine: 1,
          endCharacter: 29,
        },
        {
          type: "export_statement",
          startLine: 1,
          startCharacter: 1,
          endLine: 1,
          endCharacter: 29,
        },
      ],
    },
  };
}
