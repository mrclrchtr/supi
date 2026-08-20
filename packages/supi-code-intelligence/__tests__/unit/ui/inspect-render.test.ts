import { completedCodeQuery, unavailableCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { describe, expect, it } from "vitest";
import { renderInspectResult } from "../../../src/tool/code_inspect/markdown.ts";
import { assembleInspectResult } from "../../../src/tool/code_inspect/result.ts";

describe("renderInspectResult", () => {
  it("renders factual sections and completed-empty observations", () => {
    const result = renderInspectResult(
      assembleInspectResult(
        {
          relPath: "src/index.ts",
          line: 2,
          character: 10,
          maxResults: 5,
          confidence: "semantic",
          diagnosticWindow: { startLine: 1, endLine: 4 },
          sections: {
            node: completedCodeQuery({
              type: "identifier",
              text: "foo",
              startLine: 2,
              startCharacter: 9,
              endLine: 2,
              endCharacter: 12,
              ancestry: [
                {
                  type: "variable_declarator",
                  startLine: 2,
                  startCharacter: 9,
                  endLine: 2,
                  endCharacter: 12,
                },
              ],
            }),
            enclosingSymbol: completedCodeQuery({
              name: "widget",
              kind: "function",
              startLine: 1,
              startCharacter: 1,
              endLine: 4,
              endCharacter: 2,
            }),
            hover: completedCodeQuery(null),
            definition: completedCodeQuery([]),
            diagnostics: completedCodeQuery([]),
          },
        },
        [],
      ),
    );

    expect(result).toContain("# Inspect: src/index.ts:2:10");
    expect(result).toContain("## Syntax node");
    expect(result).toContain("variable_declarator L2:9–L2:12");
    expect(result).toContain("`widget` (function) L1:1–L4:2");
    expect(result).toContain("No hover result at this point");
    expect(result).toContain("No definition result at this point");
    expect(result).toContain("No diagnostics intersect the nearby window");
  });

  it("renders unavailable and partial section reasons plus list truncation", () => {
    const assembly = assembleInspectResult(
      {
        relPath: "src/index.ts",
        line: 3,
        character: 1,
        maxResults: 1,
        confidence: "semantic",
        diagnosticWindow: { startLine: 1, endLine: 5 },
        sections: {
          node: unavailableCodeQuery("parser unavailable"),
          enclosingSymbol: unavailableCodeQuery("outline unavailable"),
          hover: unavailableCodeQuery("hover failed"),
          definition: {
            kind: "partial",
            data: [
              { file: "src/a.ts", line: 1, character: 1 },
              { file: "src/b.ts", line: 2, character: 1 },
            ],
            reason: "one provider failed",
          },
          diagnostics: completedCodeQuery([]),
        },
      },
      [],
    );
    const result = renderInspectResult(assembly);

    expect(result).toContain("Unavailable — parser unavailable");
    expect(result).toContain("Partial — one provider failed");
    expect(result).toContain("src/a.ts:1:1");
    expect(result).not.toContain("src/b.ts:2:1");
    expect(result).toContain("more may exist — provider-limited");
    expect(assembly.details.sections).toContainEqual(
      expect.objectContaining({ key: "definition", status: "partial" }),
    );
  });
});
