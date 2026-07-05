import { describe, expect, it } from "vitest";
import { assembleFindResult } from "../../../../src/tool/result/find.ts";
import { assembleGraphResult } from "../../../../src/tool/result/graph.ts";
import { assembleHealthResult } from "../../../../src/tool/result/health.ts";
import { assembleImpactDetails } from "../../../../src/tool/result/impact.ts";
import { assembleInspectResult } from "../../../../src/tool/result/inspect.ts";
import { assembleOrientationDetails } from "../../../../src/tool/result/orientation.ts";
import {
  assembleRefactorApplyDetails,
  assembleRefactorPlanDetails,
} from "../../../../src/tool/result/refactor.ts";
import { assembleResolveResult } from "../../../../src/tool/result/resolve.ts";

const evidence = {
  key: "references.locations",
  totalCount: 3,
  shownCount: 2,
  omittedCount: 1,
  partialReason: null,
};

/** Minimal TargetStoreEntry for assembly tests. */
// biome-ignore lint/complexity/useMaxParams: test helper with explicit positional fields mirrors TargetStoreEntry shape
function resolveEntry(
  targetId: string,
  file: string,
  displayLine: number,
  displayCharacter: number,
  name: string,
  kind: string,
): import("../../../../src/session/target-store.ts").TargetStoreEntry {
  return {
    targetId,
    spanId: `sp-${targetId}`,
    file,
    position: { line: displayLine - 1, character: displayCharacter - 1 },
    displayLine,
    displayCharacter,
    name,
    kind,
    confidence: "semantic",
    provenance: "anchored",
    anchorKind: "name",
    fileFingerprint: "abc123",
    container: null,
    resolution: undefined,
  };
}

describe("tool result assembly", () => {
  it("assembles graph evidence lists and confidence", () => {
    const result = assembleGraphResult({
      displayName: "target",
      resolvedDisplayFile: "src/a.ts",
      scope: undefined,
      sections: [
        {
          kind: "ok",
          rel: "references",
          count: 3,
          content: "references",
          evidenceLists: [evidence],
        },
      ],
    });

    expect(result.details.confidence).toBe("semantic");
    expect(result.details.candidateCount).toBe(3);
    expect(result.details.omittedCount).toBe(1);
    expect(result.details.evidenceLists).toEqual([evidence]);
  });

  it("assembles find details from evidence metadata", () => {
    const result = assembleFindResult({
      confidence: "structural",
      scope: "src",
      candidateCount: 3,
      evidenceLists: [evidence],
      nextQueries: ["retry"],
    });

    expect(result.omittedCount).toBe(1);
    expect(result.scope).toBe("src");
    expect(result.nextQueries).toEqual(["retry"]);
  });

  it("assembles inspect focus and code-action evidence", () => {
    const result = assembleInspectResult(
      {
        relPath: "src/a.ts",
        line: 2,
        character: 4,
        confidence: "semantic",
        node: null,
        enclosingSymbol: null,
        hover: null,
        definitions: [],
        diagnostics: [],
        codeActions: [],
        codeActionEvidence: evidence,
        unavailableSections: ["syntax"],
      },
      ["next"],
    );

    expect(result.details.focusTarget).toBe("src/a.ts:2:4");
    expect(result.details.unavailableSections).toEqual(["syntax"]);
    expect(result.details.evidenceLists).toEqual([evidence]);
  });

  it("assembles impact details without presentation", () => {
    const result = assembleImpactDetails(
      {
        confidence: "semantic",
        affectedFiles: new Set(["src/a.ts"]),
        affectedModules: new Set(["pkg"]),
        downstreamCount: 1,
        checkNext: ["pkg"],
        likelyTests: ["a.test.ts"],
        likelyTestCommands: ["pnpm vitest run a.test.ts"],
        riskLevel: "medium",
        externalRefs: 0,
      },
      2,
      0,
      ["next"],
      null,
      [evidence],
    );

    expect(result.directCount).toBe(2);
    expect(result.riskLevel).toBe("medium");
    expect(result.evidenceLists).toEqual([evidence]);
  });

  it("assembles resolve details for a single resolved target", () => {
    const entry = resolveEntry("tg-abc", "/cwd/src/widget.ts", 1, 17, "widget", "Function");
    const result = assembleResolveResult(
      {
        kind: "resolved",
        targets: [entry],
        confidence: "semantic",
        omittedCount: 0,
        nextQueries: ["query1"],
      },
      "/cwd",
    );

    expect(result.details.confidence).toBe("semantic");
    expect(result.details.targetCount).toBe(1);
    expect(result.details.omittedCount).toBe(0);
    expect(result.details.nextQueries).toEqual(["query1"]);
    expect(result.details.targets).toHaveLength(1);
    expect(result.details.targets[0].targetId).toBe("tg-abc");
    expect(result.details.targets[0].file).toBe("src/widget.ts");
    expect(result.details.targets[0].name).toBe("widget");
    expect(result.details.evidenceLists).toHaveLength(1);
    expect(result.details.evidenceLists?.[0].key).toBe("resolve.targets");
    expect(result.details.evidenceLists?.[0].shownCount).toBe(1);
  });

  it("assembles resolve details for disambiguation candidates", () => {
    const entry = resolveEntry("tg-x", "/cwd/src/a.ts", 1, 17, "Widget", "Class");
    const candidate = {
      targetId: "tg-x",
      name: "Widget",
      kind: "Class" as const,
      container: null,
      file: "/cwd/src/a.ts",
      line: 1,
      character: 17,
      reason: "src/a.ts",
      rank: 1,
      anchorKind: "name" as const,
      entry,
    };

    const result = assembleResolveResult(
      {
        kind: "disambiguation",
        candidates: [candidate],
        omittedCount: 3,
        nextQueries: ["resolve me"],
      },
      "/cwd",
    );

    expect(result.details.targets).toHaveLength(0);
    expect(result.details.targetCount).toBe(4);
    expect(result.details.omittedCount).toBe(3);
    expect(result.details.candidates).toHaveLength(1);
    expect(result.details.candidates?.[0].name).toBe("Widget");
    expect(result.details.candidates?.[0].targetId).toBe("tg-x");
  });

  it("assembles resolve details for error/unavailable outcome", () => {
    const result = assembleResolveResult(
      {
        kind: "error",
        message: "Something went wrong",
      },
      "/cwd",
    );

    expect(result.details.confidence).toBe("unavailable");
    expect(result.details.targetCount).toBe(0);
    expect(result.details.omittedCount).toBe(0);
    expect(result.details.targets).toHaveLength(0);
    expect(result.details.nextQueries).toEqual([
      "Refine the `query` or `scope`",
      "Use anchored `file` + `line` + `character` for a precise target",
    ]);
  });

  it("assembles orientation details with candidates", () => {
    const result = assembleOrientationDetails({
      confidence: "semantic",
      focusTarget: "src/index.ts",
      renderedSections: ["defs"],
      nextQueries: ["next"],
      candidates: [
        {
          targetId: "tg-a",
          name: "A",
          kind: "Function",
          container: null,
          file: "src/a.ts",
          line: 10,
          character: 5,
          rank: 1,
        },
      ],
    });

    expect(result.confidence).toBe("semantic");
    expect(result.focusTarget).toBe("src/index.ts");
    expect(result.renderedSections).toEqual(["defs"]);
    expect(result.task).toBeNull();
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates?.[0].name).toBe("A");
  });

  it("assembles refactor plan details with edit evidence", () => {
    const edits = {
      edits: [
        {
          file: "/tmp/a.ts",
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
          newText: "x",
        },
      ],
    };
    const details = assembleRefactorPlanDetails(edits, "plan-abc", 3);

    expect(details.confidence).toBe("semantic");
    expect(details.candidateCount).toBe(1);
    expect(details.omittedCount).toBe(0);
    expect(details.evidenceLists).toHaveLength(1);
    expect(details.evidenceLists?.[0].key).toBe("refactor.edits");
    expect(details.nextQueries).toEqual([
      'Use code_refactor_apply with planId: "plan-abc" to apply this refactor',
    ]);
  });

  it("assembles refactor apply details for applied results", () => {
    const details = assembleRefactorApplyDetails({
      kind: "applied",
      filesChanged: 2,
      totalEdits: 3,
    });

    expect(details.candidateCount).toBe(3);
    expect(details.omittedCount).toBe(0);
    expect(details.nextQueries).toEqual([
      "`code_health` to check for new issues after the refactor",
    ]);
  });

  it("assembles refactor apply details for error results", () => {
    const details = assembleRefactorApplyDetails({ kind: "error", reason: "conflict" });

    expect(details.candidateCount).toBe(0);
    expect(details.omittedCount).toBe(0);
  });

  it("assembles health details from health data", () => {
    const result = assembleHealthResult(
      {
        includedSections: ["diagnostics"],
        lspAvailable: true,
        lspStatus: "ready",
        recovered: false,
        structuralStatus: "ready",
        diagnostics: [{ file: "src/a.ts", errors: 1, warnings: 0 }],
        servers: [{ name: "ts", root: ".", fileTypes: ["ts"], status: "ready" }],
        gitContext: null,
        scopeFilter: null,
        level: "summary",
        codeActions: null,
        coverage: null,
        unused: null,
      },
      [evidence],
    );

    expect(result.details.diagnosticFileCount).toBe(1);
    expect(result.details.serverCount).toBe(1);
    expect(result.details.evidenceLists).toEqual([evidence]);
  });
});
