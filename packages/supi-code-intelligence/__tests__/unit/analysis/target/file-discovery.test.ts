import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SemanticProvider, StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";
import type { DocumentSymbol, WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { createLspSemanticProvider } from "@mrclrchtr/supi-lsp/provider/lsp-semantic-provider";
import type { TreeSitterService } from "@mrclrchtr/supi-tree-sitter/api";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveFileTargetGroup } from "../../../../src/analysis/target/file.ts";

let cwd: string;
let file: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "target-file-discovery-"));
  file = path.join(cwd, "sample.ts");
  writeFileSync(file, "export class Box { method() {} }\nconst helper = () => {};\n");
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("file Target group discovery", () => {
  it("merges all declarations and lets semantic facts win duplicates", async () => {
    const semantic = semanticProvider([
      {
        name: "Box",
        kind: "Class",
        file,
        declarationAnchor: { line: 1, character: 1 },
        nameAnchor: { line: 1, character: 14 },
        container: null,
      },
      {
        name: "method",
        kind: "Method",
        file,
        declarationAnchor: { line: 1, character: 20 },
        nameAnchor: { line: 1, character: 20 },
        container: "Box",
      },
      {
        name: "helper",
        kind: "Variable",
        file,
        declarationAnchor: { line: 2, character: 1 },
        nameAnchor: { line: 2, character: 7 },
        container: null,
      },
    ]);
    const structural = structuralProvider([
      {
        name: "Box",
        kind: "class",
        startLine: 1,
        startCharacter: 1,
        endLine: 1,
        endCharacter: 33,
        children: [
          {
            name: "method",
            kind: "method",
            startLine: 1,
            startCharacter: 20,
            endLine: 1,
            endCharacter: 31,
          },
        ],
      },
      {
        name: "helper",
        kind: "function",
        startLine: 2,
        startCharacter: 1,
        endLine: 2,
        endCharacter: 25,
      },
    ]);

    const outcome = await resolveFileTargetGroup(file, cwd, { semantic, structural });

    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") return;
    expect(outcome.group.targets).toHaveLength(3);
    expect(outcome.group.targets.map((target) => [target.name, target.container])).toEqual([
      ["Box", null],
      ["method", "Box"],
      ["helper", null],
    ]);
    expect(outcome.group.targets[0]).toMatchObject({
      confidence: "semantic",
      anchorKind: "name",
      displayCharacter: 14,
      provenance: ["semantic", "structural"] as const,
    });
    expect(outcome.group.targets[2]).toMatchObject({
      confidence: "semantic",
      anchorKind: "name",
      provenance: ["semantic", "structural"] as const,
    });
  });

  it("deduplicates declarations emitted through the real provider adapters", async () => {
    const documentSymbols: DocumentSymbol[] = [
      {
        name: "Box",
        kind: 5,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 33 } },
        selectionRange: { start: { line: 0, character: 13 }, end: { line: 0, character: 16 } },
        children: [
          {
            name: "method",
            kind: 6,
            range: { start: { line: 0, character: 19 }, end: { line: 0, character: 31 } },
            selectionRange: {
              start: { line: 0, character: 19 },
              end: { line: 0, character: 25 },
            },
          },
        ],
      },
      {
        name: "helper",
        kind: 13,
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 24 } },
        selectionRange: { start: { line: 1, character: 6 }, end: { line: 1, character: 12 } },
      },
    ];
    const semantic = createLspSemanticProvider({
      documentSymbols: async () => documentSymbols,
    } as unknown as WorkspaceLspRuntime);
    const structural = createTreeSitterProvider({
      outline: async () => ({
        kind: "success",
        data: [
          {
            name: "Box",
            kind: "class",
            range: { startLine: 1, startCharacter: 1, endLine: 1, endCharacter: 33 },
            children: [
              {
                name: "method",
                kind: "method",
                range: { startLine: 1, startCharacter: 20, endLine: 1, endCharacter: 31 },
              },
            ],
          },
          {
            name: "helper",
            kind: "function",
            range: { startLine: 2, startCharacter: 1, endLine: 2, endCharacter: 25 },
          },
        ],
      }),
    } as unknown as TreeSitterService);

    const outcome = await resolveFileTargetGroup(file, cwd, { semantic, structural });

    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") return;
    expect(outcome.group.targets.map((target) => target.name)).toEqual(["Box", "method", "helper"]);
    expect(outcome.group.targets.every((target) => target.confidence === "semantic")).toBe(true);
    expect(outcome.group.targets.every((target) => target.provenance.length === 2)).toBe(true);
  });

  it("keeps group confidence at the weakest member while retaining discovery provenance", async () => {
    const outcome = await resolveFileTargetGroup(file, cwd, {
      semantic: semanticProvider([]),
      structural: structuralProvider([
        {
          name: "Box",
          kind: "class",
          startLine: 1,
          startCharacter: 1,
          endLine: 1,
          endCharacter: 33,
        },
      ]),
    });

    expect(outcome).toMatchObject({
      kind: "resolved",
      group: {
        confidence: "structural",
        discoveryProvenance: ["semantic", "structural"],
        targets: [{ confidence: "structural", provenance: ["structural"] }],
      },
    });
  });

  it("returns a successful empty group after complete enumeration", async () => {
    const outcome = await resolveFileTargetGroup(file, cwd, {
      semantic: semanticProvider([]),
      structural: structuralProvider([]),
    });

    expect(outcome).toMatchObject({
      kind: "resolved",
      group: {
        targets: [],
        confidence: "semantic",
        discoveryProvenance: ["semantic", "structural"],
      },
    });
  });

  it("returns unavailable discovery when neither provider can enumerate", async () => {
    const outcome = await resolveFileTargetGroup(file, cwd, {
      semantic: semanticProvider(null),
      structural: structuralProvider(null),
    });

    expect(outcome).toEqual({
      kind: "unavailable",
      message: "Declaration discovery is unavailable for `sample.ts`.",
    });
  });
});

function semanticProvider(
  symbols: Awaited<ReturnType<SemanticProvider["documentSymbols"]>>,
): SemanticProvider {
  return {
    documentSymbols: async () => symbols,
    workspaceSymbols: async () => [],
    references: async () => [],
    implementation: async () => [],
  };
}

function structuralProvider(
  outline: Array<{
    name: string;
    kind: string;
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
    children?: unknown[];
  }> | null,
): StructuralProvider {
  return {
    outline: async () =>
      outline === null
        ? { kind: "runtime-error", message: "unavailable" }
        : { kind: "success", data: outline as never },
    exports: async () => ({ kind: "success", data: [] }),
    imports: async () => ({ kind: "success", data: [] }),
    calleesAt: async () => ({ kind: "runtime-error", message: "unused" }),
    nodeAt: async () => ({ kind: "runtime-error", message: "unused" }),
    callSites: async () => ({ kind: "success", data: [] }),
  };
}
