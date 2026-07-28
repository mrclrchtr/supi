import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  completedCodeQuery,
  type SemanticProvider,
  type StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveFileTargetGroup } from "../../../../src/analysis/target/file.ts";

let cwd: string;
let file: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "target-file-nesting-"));
  file = path.join(cwd, "sample.ts");
  writeFileSync(file, "function parent() {}\nfunction same() {}\nfunction laterTop() {}\n");
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("file Target group nesting evidence", () => {
  it("normalizes absent and invalid provider nesting to unknown", async () => {
    const semantic = semanticProvider([
      {
        name: "legacy",
        kind: "Function",
        file,
        declarationAnchor: { line: 1, character: 1 },
        nameAnchor: { line: 1, character: 10 },
        container: null,
      },
      {
        name: "invalid",
        kind: "Function",
        file,
        declarationAnchor: { line: 2, character: 1 },
        nameAnchor: { line: 2, character: 10 },
        container: null,
        nesting: "sideways",
      },
    ]);

    const outcome = await resolveFileTargetGroup(file, cwd, { semantic });

    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") return;
    expect(outcome.group.targets.map((target) => target.name)).toEqual(["legacy", "invalid"]);
    expect(outcome.group.unknownNestingCount).toBe(2);
    expect(
      outcome.group.targets.map((target) => (target as unknown as { nesting: unknown }).nesting),
    ).toEqual(["unknown", "unknown"]);

    const refined = await resolveFileTargetGroup(file, cwd, {
      semantic,
      structural: structuralProvider([outlineSymbol("legacy", 1), outlineSymbol("invalid", 2)]),
    });
    expect(refined.kind).toBe("resolved");
    if (refined.kind !== "resolved") return;
    expect(refined.group.unknownNestingCount).toBe(0);
    expect(
      refined.group.targets.map((target) => (target as unknown as { nesting: unknown }).nesting),
    ).toEqual(["top-level", "top-level"]);
  });

  it("merges exact known hierarchy conflicts conservatively across provider order", async () => {
    const semanticSymbols = [
      semanticSymbol("same", 2, "top-level"),
      semanticSymbol("laterTop", 3, "top-level"),
    ];
    const outline = [
      {
        name: "parent",
        kind: "function",
        startLine: 1,
        startCharacter: 1,
        endLine: 2,
        endCharacter: 30,
        children: [outlineSymbol("same", 2)],
      },
      outlineSymbol("laterTop", 3),
    ];

    const first = await resolveFileTargetGroup(file, cwd, {
      semantic: semanticProvider(semanticSymbols),
      structural: structuralProvider(outline),
    });
    const reversed = await resolveFileTargetGroup(file, cwd, {
      semantic: semanticProvider([...semanticSymbols].reverse()),
      structural: structuralProvider([...outline].reverse()),
    });

    expect(first.kind).toBe("resolved");
    expect(reversed.kind).toBe("resolved");
    if (first.kind !== "resolved" || reversed.kind !== "resolved") return;
    expect(projectTargets(first.group.targets)).toEqual([
      { name: "parent", container: null, nesting: "top-level", provenance: ["structural"] },
      {
        name: "laterTop",
        container: null,
        nesting: "top-level",
        provenance: ["semantic", "structural"],
      },
      {
        name: "same",
        container: null,
        nesting: "unknown",
        provenance: ["semantic", "structural"],
      },
    ]);
    expect(first.group.unknownNestingCount).toBe(1);
    expect(first.group.targets).toHaveLength(3);
    expect(projectTargets(reversed.group.targets)).toEqual(projectTargets(first.group.targets));
    expect(reversed.group.unknownNestingCount).toBe(1);
  });
});

function semanticProvider(symbols: readonly unknown[]): SemanticProvider {
  return {
    documentSymbols: async () => completedCodeQuery(symbols as never),
    workspaceSymbols: async () => completedCodeQuery([]),
    references: async () => completedCodeQuery([]),
    implementation: async () => completedCodeQuery([]),
  };
}

function structuralProvider(outline: readonly unknown[]): StructuralProvider {
  return {
    outline: async () => ({ kind: "success", data: outline as never }),
    exports: async () => ({ kind: "success", data: [] }),
    imports: async () => ({ kind: "success", data: [] }),
    calleesAt: async () => ({ kind: "runtime-error", message: "unused" }),
    nodeAt: async () => ({ kind: "runtime-error", message: "unused" }),
    callSites: async () => ({ kind: "success", data: [] }),
  };
}

function semanticSymbol(name: string, line: number, nesting: "top-level" | "nested") {
  return {
    name,
    kind: "Function",
    file,
    declarationAnchor: { line, character: 1 },
    nameAnchor: { line, character: 10 },
    container: null,
    nesting,
  };
}

function outlineSymbol(name: string, line: number) {
  return {
    name,
    kind: "function",
    startLine: line,
    startCharacter: 1,
    endLine: line,
    endCharacter: 20,
  };
}

function projectTargets(targets: readonly unknown[]) {
  return targets.map((value) => {
    const target = value as {
      name: string | null;
      container: string | null;
      nesting: unknown;
      provenance: readonly string[];
    };
    return {
      name: target.name,
      container: target.container,
      nesting: target.nesting,
      provenance: [...target.provenance],
    };
  });
}
