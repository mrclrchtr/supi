import { describe, expect, it } from "vitest";
import { renderGraphResult } from "../../../../src/tool/graph/markdown.ts";
import { renderResolveResult } from "../../../../src/tool/resolve/markdown.ts";
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
          data: {
            references: [],
            externalCount: 0,
            invalidLocationCount: 0,
            partialReason: null,
            confidence: "semantic",
          },
          readNext: [{ file: "src/a.ts", startLine: 1, endLine: 2, reason: "target" }],
        },
      ],
    });

    expect(assembly.assembled.confidence).toBe("semantic");
    expect(assembly.assembled.sections[0]?.key).toBe("references");
    expect(assembly.assembled.actions.some((action) => action.kind === "read-next")).toBe(true);
    expect(assembly.details.candidateCount).toBe(0);
  });

  it("bounds every graph relation once for markdown and structured details", () => {
    const assembly = assembleGraphResult({
      displayName: "foo",
      resolvedDisplayFile: "src/a.ts",
      maxResults: 1,
      cwd: "/repo",
      sections: [
        {
          kind: "ok",
          rel: "references",
          data: {
            references: [
              { name: "foo", file: "/repo/src/ref-a.ts", line: 1, character: 1 },
              { name: "foo", file: "/repo/src/ref-b.ts", line: 2, character: 1 },
            ],
            externalCount: 0,
            invalidLocationCount: 0,
            partialReason: null,
            confidence: "semantic",
          },
          readNext: [],
        },
        {
          kind: "ok",
          rel: "callees",
          data: {
            enclosingScope: { name: "foo", file: "/repo/src/a.ts", startLine: 1, endLine: 5 },
            calls: [
              { name: "callA", file: "/repo/src/a.ts", line: 2 },
              { name: "callB", file: "/repo/src/a.ts", line: 3 },
            ],
            depth: "direct",
          },
          readNext: [],
        },
        {
          kind: "ok",
          rel: "implements",
          data: {
            implementations: [
              { name: "ImplA", file: "/repo/src/impl-a.ts", line: 1, character: 1 },
              { name: "ImplB", file: "/repo/src/impl-b.ts", line: 1, character: 1 },
            ],
            externalCount: 0,
            invalidLocationCount: 0,
            partialReason: null,
          },
          readNext: [],
        },
      ],
    });
    const markdown = renderGraphResult(assembly);

    expect(assembly.details.evidenceLists).toEqual([
      expect.objectContaining({ key: "references.locations", shownCount: 1, omittedCount: 1 }),
      expect.objectContaining({ key: "callees.calls", shownCount: 1, omittedCount: 1 }),
      expect.objectContaining({ key: "implements.locations", shownCount: 1, omittedCount: 1 }),
    ]);
    expect(markdown).toContain("ref-a.ts");
    expect(markdown).not.toContain("ref-b.ts");
    expect(markdown).toContain("callA");
    expect(markdown).not.toContain("callB");
    expect(markdown).toContain("impl-a.ts");
    expect(markdown).not.toContain("impl-b.ts");
    expect(markdown.match(/showing 1 of 2; 1 omitted/g)).toHaveLength(3);
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
          provenance: ["semantic"] as const,
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

  it("keeps no-symbol coordinate errors plain in details and frames markdown once", () => {
    const message = "No symbol target resolved at `widget.ts:3:3` (on `comment`).";
    const assembly = assembleResolveResult({ kind: "invalid-input", message }, "/repo");
    const markdown = renderResolveResult(assembly);

    expect(assembly.details).toMatchObject({ resultKind: "invalid-input", message });
    expect(assembly.details.message).not.toContain("**Error:**");
    expect(markdown).toBe(`**Error:** ${message}`);
    expect(markdown.match(/\*\*Error:\*\*/g)).toHaveLength(1);
  });

  it("renders one note for structural identifier resolution", () => {
    const assembly = assembleResolveResult(
      {
        kind: "resolved",
        notes: [
          "Resolved from provider-backed structural identifier evidence.",
          "Independent workflow note.",
        ],
        entry: {
          targetId: "tg-structural",
          spanId: "sp-structural",
          file: "/repo/src/a.ts",
          position: { line: 0, character: 16 },
          displayLine: 1,
          displayCharacter: 17,
          name: "foo",
          kind: "Function",
          container: null,
          confidence: "semantic",
          provenance: ["semantic", "structural"] as const,
          anchorKind: "name",
          fileFingerprint: "fp",
          resolution: {
            requested: { line: 1, character: 17 },
            resolved: { line: 1, character: 17 },
            snapped: false,
            source: "structural-identifier",
          },
        },
      },
      "/repo",
    );

    const markdown = renderResolveResult(assembly);

    expect(markdown.match(/_Note:/g)).toHaveLength(2);
    expect(markdown).toContain("structural-identifier evidence");
    expect(markdown).toContain("Independent workflow note");
  });

  it("assembles a typed symbol-kind mismatch without inventing candidate reasons", () => {
    const assembly = assembleResolveResult(
      {
        kind: "kind-mismatch",
        requestedKind: "class",
        candidates: [
          {
            targetId: "tg-near",
            name: "Widget",
            kind: "Variable",
            container: null,
            file: "src/widget.ts",
            line: 3,
            character: 7,
            rank: 1,
            anchorKind: "name",
          },
        ],
        omittedCount: 0,
      },
      "/repo",
    );
    const markdown = renderResolveResult(assembly);

    expect(assembly.details).toMatchObject({
      resultKind: "kind-mismatch",
      requestedKind: "class",
      targetCount: 1,
      candidates: [{ targetId: "tg-near", kind: "Variable" }],
    });
    expect(assembly.details.candidates?.[0]).not.toHaveProperty("reason");
    expect(markdown).toContain("No exact symbol-kind match");
    expect(markdown).toContain("Retry without `symbolKind`");
  });

  it("assembles a bounded file Target group without synthetic handles", () => {
    const makeTarget = (name: string, line: number) => ({
      targetId: `tg-${name}`,
      spanId: `sp-${name}`,
      file: "/repo/src/a.ts",
      position: { line: line - 1, character: 7 },
      displayLine: line,
      displayCharacter: 8,
      name,
      kind: "Function",
      container: null,
      confidence: "semantic" as const,
      provenance: ["semantic", "structural"] as const,
      anchorKind: "name" as const,
      fileFingerprint: "fp",
    });
    const assembly = assembleResolveResult(
      {
        kind: "target-group",
        file: "/repo/src/a.ts",
        confidence: "semantic",
        discoveryProvenance: ["semantic", "structural"],
        targets: [makeTarget("one", 1)],
        totalCount: 2,
        omittedCount: 1,
        unknownNestingCount: 1,
      },
      "/repo",
    );
    const markdown = renderResolveResult(assembly);

    expect(assembly.details).toMatchObject({
      resultKind: "target-group",
      groupFile: "src/a.ts",
      groupDiscoveryProvenance: ["semantic", "structural"],
      groupUnknownNestingCount: 1,
      targetCount: 2,
      omittedCount: 1,
      targets: [{ targetId: "tg-one" }],
    });
    expect(assembly.details.evidenceLists).toContainEqual({
      key: "resolve.targets",
      totalCount: 2,
      shownCount: 1,
      omittedCount: 1,
      partialReason: null,
    });
    expect(markdown).toContain("Targets in `src/a.ts`");
    expect(markdown).toContain("tg-one");
    expect(markdown).toContain("provenance: semantic+structural");
    expect(markdown).toContain("1 declaration has unknown hierarchy");
    expect(markdown).not.toContain("tg-two");
    expect(markdown).toContain("showing 1 of 2; 1 omitted");
  });

  it("assembles Orientation facts before markdown rendering", () => {
    const assembly = assembleOrientationResult({
      title: "Project",
      notes: [],
      sections: [
        {
          key: "orientation",
          title: "orientation",
          status: "complete",
          reason: null,
          confidence: "structural",
          provenance: [{ source: "structural", capability: "test" }],
          evidenceLists: [],
          items: [],
        },
      ],
      confidence: "structural",
      focusTarget: null,
      requestedSections: [],
      renderedSections: ["orientation"],
      omittedCount: 0,
      nextQueries: ["inspect a module"],
      readNext: [],
    });

    expect(assembly.assembled.data.title).toBe("Project");
    expect(assembly.details.renderedSections).toEqual(["orientation"]);
  });

  it("assembles refactor evidence and apply guidance", () => {
    const assembly = assembleRefactorPlanDetails(
      {
        id: "plan-1",
        operation: "rename_symbol",
        targetFile: "/repo/src/a.ts",
        targetLine: 1,
        targetCharacter: 1,
        authorizedMutationRoots: ["/repo"],
        edits: {
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
        fileFingerprints: [],
        createdAt: 0,
      },
      "/repo",
    );

    expect(assembly.details.candidateCount).toBe(1);
    expect(assembly.assembled.evidenceLists[0]?.key).toBe("refactor.edits");
    expect(assembly.details.nextQueries[0]).toContain("plan-1");
  });
});
