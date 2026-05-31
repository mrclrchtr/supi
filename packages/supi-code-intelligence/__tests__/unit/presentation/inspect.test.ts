import { describe, expect, it } from "vitest";

describe("renderInspectResult", () => {
  it("renders a factual point inspection with next-step guidance", async () => {
    const inspectModulePath = "../../../src/presentation/markdown/inspect.ts" as string;
    const { renderInspectResult } = await import(inspectModulePath);

    const result = renderInspectResult({
      relPath: "src/index.ts",
      line: 2,
      character: 10,
      confidence: "semantic",
      node: {
        type: "identifier",
        text: "foo",
        startLine: 2,
        startCharacter: 9,
        ancestry: ["variable_declarator", "lexical_declaration"],
      },
      enclosingSymbol: {
        name: "widget",
        kind: "function",
        startLine: 1,
        endLine: 4,
      },
      hover: "const foo: number",
      definitions: [{ file: "src/helper.ts", line: 1, character: 1 }],
      diagnostics: [
        {
          line: 2,
          severity: "error",
          message: "Cannot assign to 'foo' because it is a constant.",
        },
      ],
      codeActions: [{ title: "Remove unused import", kind: "quickfix" }],
      unavailableSections: [],
      nextQueries: [
        "`code_graph` with anchored file coordinates for relationships",
        "`code_health` for provider state",
      ],
    });

    expect(result).toContain("# Inspect: src/index.ts:2:10");
    expect(result).toContain("## Node");
    expect(result).toContain("identifier");
    expect(result).toContain("variable_declarator");
    expect(result).toContain("## Enclosing symbol");
    expect(result).toContain("widget");
    expect(result).toContain("## Hover");
    expect(result).toContain("const foo: number");
    expect(result).toContain("## Definition");
    expect(result).toContain("src/helper.ts:1:1");
    expect(result).toContain("## Diagnostics");
    expect(result).toContain("Cannot assign to 'foo'");
    expect(result).toContain("## Code Actions");
    expect(result).toContain("Remove unused import");
    expect(result).toContain("## Next");
    expect(result).toContain("code_graph");
    expect(result).toContain("code_health");
  });

  it("renders explicit unavailable sections when provider data is missing", async () => {
    const inspectModulePath = "../../../src/presentation/markdown/inspect.ts" as string;
    const { renderInspectResult } = await import(inspectModulePath);

    const result = renderInspectResult({
      relPath: "src/index.ts",
      line: 2,
      character: 10,
      confidence: "unavailable",
      node: null,
      enclosingSymbol: null,
      hover: null,
      definitions: [],
      diagnostics: [],
      codeActions: [],
      unavailableSections: ["syntax", "hover", "definition", "diagnostics", "codeActions"],
      nextQueries: ["Use `code_health` to inspect provider state"],
    });

    expect(result).toContain("# Inspect: src/index.ts:2:10");
    expect(result).toContain("## Unavailable");
    expect(result).toContain("syntax");
    expect(result).toContain("hover");
    expect(result).toContain("definition");
    expect(result).toContain("diagnostics");
    expect(result).toContain("codeActions");
    expect(result).toContain("code_health");
    expect(result).not.toContain("heuristic");
  });
});
