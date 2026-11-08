import {
  type CodeSymbol,
  completedCodeQuery,
  partialCodeQuery,
  type SemanticProvider,
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
      totalCount: null,
      omittedCount: 0,
      partialReason: "provider-limited",
      partialMessage: "One route failed.",
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
    ).resolves.toMatchObject({ kind: "disambiguation", totalCount: null });
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
      totalCount: null,
      omittedCount: 1,
      partialReason: "provider-limited",
      partialMessage: "One route failed.",
      candidates: [{ name: "Widget", rank: 1 }],
    });
  });
  it.each([1, 6])("puts exact names first before the display cap of %s", async (maxResults) => {
    const result = await resolveSymbolTarget(
      "ShowingPositionRow",
      "/project",
      provider([
        candidate("ShowingPositionRowProps", "props"),
        candidate("ShowingPositionRow", "component"),
      ]),
      { maxResults },
    );

    expect(result).toMatchObject({
      kind: "disambiguation",
      totalCount: 2,
      omittedCount: maxResults === 1 ? 1 : 0,
      partialReason: null,
    });
    if (result.kind !== "disambiguation") throw new Error("Expected candidates");
    expect(result.candidates.map(({ name, rank }) => ({ name, rank }))).toEqual(
      maxResults === 1
        ? [{ name: "ShowingPositionRow", rank: 1 }]
        : [
            { name: "ShowingPositionRow", rank: 1 },
            { name: "ShowingPositionRowProps", rank: 2 },
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
