import { describe, expect, it } from "vitest";

describe("renderInspectResult", () => {
  it("renders a factual point inspection with next-step guidance", async () => {
    const inspectModulePath = "../../../src/tool/inspect/markdown.ts" as string;
    const resultModulePath = "../../../src/tool/result/inspect.ts" as string;
    const { renderInspectResult } = await import(inspectModulePath);
    const { assembleInspectResult } = await import(resultModulePath);

    const result = renderInspectResult(
      assembleInspectResult(
        {
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
          unavailableSections: [],
        },
        [
          "`code_graph` with anchored file coordinates for relationships",
          "`code_health` for provider state",
        ],
      ),
    );

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
  });

  it("renders explicit unavailable sections when provider data is missing", async () => {
    const inspectModulePath = "../../../src/tool/inspect/markdown.ts" as string;
    const resultModulePath = "../../../src/tool/result/inspect.ts" as string;
    const { renderInspectResult } = await import(inspectModulePath);
    const { assembleInspectResult } = await import(resultModulePath);

    const result = renderInspectResult(
      assembleInspectResult(
        {
          relPath: "src/index.ts",
          line: 2,
          character: 10,
          confidence: "unavailable",
          node: null,
          enclosingSymbol: null,
          hover: null,
          definitions: [],
          diagnostics: [],
          unavailableSections: ["syntax", "hover", "definition", "diagnostics"],
        },
        [],
      ),
    );

    expect(result).toContain("# Inspect: src/index.ts:2:10");
    expect(result).toContain("## Unavailable");
    expect(result).toContain("syntax");
    expect(result).toContain("hover");
    expect(result).toContain("definition");
    expect(result).toContain("diagnostics");
    expect(result).not.toContain("heuristic");
  });
});
