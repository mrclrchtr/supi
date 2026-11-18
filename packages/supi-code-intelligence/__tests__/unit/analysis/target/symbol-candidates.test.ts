import {
  type CodeSymbol,
  completedCodeQuery,
  partialCodeQuery,
  type SemanticProvider,
  type StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import { describe, expect, it } from "vitest";
import { resolveSymbolTarget } from "../../../../src/analysis/target/symbol.ts";

function candidate(name: string, file: string): CodeSymbol {
  return {
    name,
    kind: "Function",
    file: `/project/src/${file}.ts`,
    declarationAnchor: { line: 1, character: 1 },
    container: null,
  };
}

function provider(symbols: CodeSymbol[], reason?: string): SemanticProvider {
  return {
    workspaceSymbols: async () =>
      reason ? partialCodeQuery(symbols, reason) : completedCodeQuery(symbols),
    documentSymbols: async () => completedCodeQuery([]),
  } as unknown as SemanticProvider;
}

describe("symbol candidates", () => {
  it("does not select one exact-name candidate from an incomplete result", async () => {
    const result = await resolveSymbolTarget(
      "Widget",
      "/project",
      provider([candidate("Widget", "widget")], "One route failed."),
      { maxResults: 6 },
    );

    expect(result).toMatchObject({
      kind: "disambiguation",
      candidateEvidence: {
        key: "target.candidates",
        completeness: "partial",
        totalCount: null,
        shownCount: 1,
        omittedCount: 0,
        partialReason: "provider-limited",
        partialMessage: "One route failed.",
      },
      candidates: [{ name: "Widget", rank: 1 }],
    });
  });

  it("resolves one candidate when policy exclusions are the only gap", async () => {
    const symbols = [candidate("Widget", "widget")];
    const exclusionOnly: SemanticProvider = {
      workspaceSymbols: async () =>
        partialCodeQuery(symbols, "Automatic path policy excluded 1 workspace-symbol result.", {
          automaticPathExclusion: { excludedCount: 1, examples: ["/project/dist/widget.d.ts"] },
          exclusionOnly: true,
        }),
      documentSymbols: async () => completedCodeQuery([]),
    } as unknown as SemanticProvider;

    await expect(
      resolveSymbolTarget("Widget", "/project", exclusionOnly, { maxResults: 6 }),
    ).resolves.toMatchObject({
      kind: "resolved",
      target: { name: "Widget", file: "/project/src/widget.ts" },
    });
  });

  it("keeps disambiguation when exclusions accompany another gap", async () => {
    const symbols = [candidate("Widget", "widget")];
    const mixed: SemanticProvider = {
      workspaceSymbols: async () =>
        partialCodeQuery(
          symbols,
          "One route failed.; Automatic path policy excluded 1 workspace-symbol result.",
          { automaticPathExclusion: { excludedCount: 1, examples: ["/project/dist/widget.d.ts"] } },
        ),
      documentSymbols: async () => completedCodeQuery([]),
    } as unknown as SemanticProvider;

    await expect(
      resolveSymbolTarget("Widget", "/project", mixed, { maxResults: 6 }),
    ).resolves.toMatchObject({
      kind: "disambiguation",
      candidateEvidence: { completeness: "partial", totalCount: null },
    });
  });

  it("preserves the reason and name order when the requested kind has no match", async () => {
    const result = await resolveSymbolTarget(
      "Widget",
      "/project",
      provider(
        [candidate("WidgetProps", "props"), candidate("Widget", "widget")],
        "One route failed.",
      ),
      { kind: "interface", maxResults: 1 },
    );

    expect(result).toMatchObject({
      kind: "kind-mismatch",
      candidateEvidence: {
        key: "target.candidates",
        completeness: "partial",
        totalCount: null,
        shownCount: 1,
        omittedCount: 1,
        partialReason: "provider-limited",
        partialMessage: "One route failed.",
      },
      candidates: [{ name: "Widget", rank: 1 }],
    });
  });
  it("selects the only exact-name match and names the partial-name matches", async () => {
    const result = await resolveSymbolTarget(
      "Widget",
      "/project",
      provider([
        candidate("WidgetProps", "props"),
        candidate("Widget", "widget"),
        candidate("widget", "lowercase"),
      ]),
    );

    expect(result).toMatchObject({
      kind: "resolved",
      target: { name: "Widget", file: "/project/src/widget.ts" },
      notes: [
        "Selected the only exact-name match; 2 partial-name matches (`WidgetProps`, `widget`) were not selected.",
      ],
    });
  });

  it("selects the declaration over a re-export binding of the same name", async () => {
    const reExport: CodeSymbol = {
      ...candidate("Widget", "index"),
      kind: "Variable",
      declarationAnchor: { line: 2, character: 3 },
    };
    const span = { startLine: 2, startCharacter: 3, endLine: 2, endCharacter: 9 };
    const structural = {
      imports: async () => ({ kind: "success", data: [] }),
      exports: async (file: string) => ({
        kind: "success",
        data: file.endsWith("index.ts") ? [{ name: "Widget", kind: "re-export", ...span }] : [],
      }),
    } as unknown as StructuralProvider;
    const symbols = [reExport, candidate("Widget", "widget"), candidate("WidgetProps", "props")];

    await expect(
      resolveSymbolTarget("Widget", "/project", provider(symbols), { structural }),
    ).resolves.toMatchObject({
      kind: "resolved",
      target: { name: "Widget", file: "/project/src/widget.ts" },
      notes: [
        // biome-ignore lint/security/noSecrets: note text, not a secret.
        "Selected the only declaration of that name; 1 import or export-list binding of that name (`index.ts`) and 1 partial-name match (`WidgetProps`) were not selected.",
      ],
    });
    // Without syntax evidence both exact names stay candidates.
    await expect(
      resolveSymbolTarget("Widget", "/project", provider(symbols)),
    ).resolves.toMatchObject({ kind: "disambiguation" });
  });

  it("keeps candidates when an incomplete result has one exact name among others", async () => {
    const result = await resolveSymbolTarget(
      "Widget",
      "/project",
      provider(
        [candidate("WidgetProps", "props"), candidate("Widget", "widget")],
        "One route failed.",
      ),
    );

    expect(result.kind).toBe("disambiguation");
  });

  it.each([1, 6])("puts exact names first before the display cap of %s", async (maxResults) => {
    const result = await resolveSymbolTarget(
      "ShowingPositionRow",
      "/project",
      provider([
        candidate("ShowingPositionRowProps", "props"),
        candidate("ShowingPositionRow", "first"),
        candidate("ShowingPositionRow", "second"),
      ]),
      { maxResults },
    );

    expect(result).toMatchObject({
      kind: "disambiguation",
      candidateEvidence: {
        key: "target.candidates",
        completeness: maxResults === 1 ? "capped" : "complete",
        totalCount: 3,
        shownCount: maxResults === 1 ? 1 : 3,
        omittedCount: maxResults === 1 ? 2 : 0,
        partialReason: null,
      },
    });
    if (result.kind !== "disambiguation") throw new Error("Expected candidates");
    expect(result.candidates.map(({ name, rank }) => ({ name, rank }))).toEqual(
      maxResults === 1
        ? [{ name: "ShowingPositionRow", rank: 1 }]
        : [
            { name: "ShowingPositionRow", rank: 1 },
            { name: "ShowingPositionRow", rank: 2 },
            { name: "ShowingPositionRowProps", rank: 3 },
          ],
    );
  });

  it("keeps provider order within exact and other name matches", async () => {
    const result = await resolveSymbolTarget(
      "Widget",
      "/project",
      provider([
        candidate("widget", "lowercase"),
        candidate("WidgetProps", "props"),
        candidate("Widget", "first"),
        candidate("WidgetFactory", "factory"),
        candidate("Widget", "second"),
      ]),
    );

    if (result.kind !== "disambiguation") throw new Error("Expected candidates");
    expect(result.candidates.map(({ file }) => file)).toEqual([
      "src/first.ts",
      "src/second.ts",
      "src/lowercase.ts",
      "src/props.ts",
      "src/factory.ts",
    ]);
  });
});
