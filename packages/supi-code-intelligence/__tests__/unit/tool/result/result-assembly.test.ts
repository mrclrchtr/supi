import { describe, expect, it } from "vitest";
import { assembleToolResult } from "../../../../src/tool/result/assembly.ts";
import { assembleGraphResult } from "../../../../src/tool/result/graph.ts";
import { assembleOrientationResult } from "../../../../src/tool/result/orientation.ts";
import { assembleRefactorPlanDetails } from "../../../../src/tool/result/refactor.ts";
import { assembleResolveResult } from "../../../../src/tool/result/resolve.ts";

const provenance = [{ source: "semantic" as const, capability: "test" }];

describe("canonical Tool result assembly", () => {
  it("centralizes totals, partial omission metadata, provenance, and actions", () => {
    const result = assembleToolResult({
      data: { value: 1 },
      sections: [
        {
          key: "items",
          title: "Items",
          status: "partial",
          items: [1, 2],
          confidence: "semantic",
          provenance,
        },
      ],
      evidenceLists: [
        {
          key: "items",
          totalCount: null,
          shownCount: 2,
          omittedCount: null,
          partialReason: "timeout",
        },
      ],
      nextQueries: ["narrow the query"],
      readNext: [{ file: "src/a.ts", startLine: 1, endLine: 5, reason: "inspect" }],
      candidateCount: 2,
      confidence: "semantic",
      provenance,
    });

    expect(result.totals).toEqual({
      candidateCount: 2,
      shownCount: 2,
      omittedCount: 0,
      hasUnknownRemainder: true,
      partialReasons: ["timeout"],
    });
    expect(result.actions.map((action) => action.kind)).toEqual(["query", "read-next"]);
    expect(result.provenance).toEqual(provenance);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("assembles graph sections and shared read-next actions", () => {
    const assembly = assembleGraphResult({
      displayName: "foo",
      resolvedDisplayFile: "src/a.ts",
      maxResults: 10,
      cwd: "/repo",
      sections: [
        {
          kind: "ok",
          rel: "references",
          data: { references: [], externalCount: 0, confidence: "semantic" },
          evidenceLists: [
            {
              key: "graph.references",
              totalCount: 0,
              shownCount: 0,
              omittedCount: 0,
              partialReason: null,
            },
          ],
          readNext: [{ file: "src/a.ts", startLine: 1, endLine: 2, reason: "target" }],
        },
      ],
    });

    expect(assembly.assembled.confidence).toBe("semantic");
    expect(assembly.assembled.sections[0]?.key).toBe("references");
    expect(assembly.assembled.actions.some((action) => action.kind === "read-next")).toBe(true);
    expect(assembly.details.candidateCount).toBe(0);
  });

  it("assembles a resolved target with provenance and a follow-up query", () => {
    const assembly = assembleResolveResult(
      {
        kind: "resolved",
        notes: [],
        entry: {
          targetId: "tg-1",
          spanId: "sp-1",
          file: "/repo/src/a.ts",
          position: { line: 0, character: 0 },
          displayLine: 1,
          displayCharacter: 1,
          name: "foo",
          kind: "Function",
          container: null,
          confidence: "semantic",
          provenance: "workspace-symbol",
          anchorKind: "name",
          fileFingerprint: "fp",
        },
      },
      "/repo",
    );

    expect(assembly.details.targets[0]?.file).toBe("src/a.ts");
    expect(assembly.assembled.provenance[0]?.source).toBe("semantic");
    expect(assembly.assembled.actions[0]?.kind).toBe("query");
  });

  it("assembles Orientation blocks before markdown rendering", () => {
    const assembly = assembleOrientationResult({
      blocks: [{ kind: "heading", level: 1, text: "Project" }],
      confidence: "structural",
      focusTarget: null,
      requestedSections: [],
      renderedSections: ["orientation"],
      omittedCount: 0,
      nextQueries: ["inspect a module"],
      readNext: [],
    });

    expect(assembly.assembled.data.blocks[0]).toEqual({
      kind: "heading",
      level: 1,
      text: "Project",
    });
    expect(assembly.details.renderedSections).toEqual(["orientation"]);
  });

  it("assembles refactor evidence and apply guidance", () => {
    const assembly = assembleRefactorPlanDetails(
      {
        edits: [
          {
            file: "/repo/src/a.ts",
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 3 },
            },
            newText: "bar",
          },
        ],
      },
      "plan-1",
    );

    expect(assembly.details.candidateCount).toBe(1);
    expect(assembly.assembled.evidenceLists[0]?.key).toBe("refactor.edits");
    expect(assembly.details.nextQueries[0]).toContain("plan-1");
  });
});
