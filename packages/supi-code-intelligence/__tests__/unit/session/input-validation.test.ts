import { describe, expect, it } from "vitest";
import { parseResolveRequest, parseTargetInput } from "../../../src/session/input/common.ts";
import {
  parseHealthWorkflowInput,
  parseRefactorPlanWorkflowInput,
} from "../../../src/session/input/health-refactor.ts";
import {
  parseFindWorkflowInput,
  parseGraphWorkflowInput,
  parseInspectWorkflowInput,
  parseOrientationWorkflowInput,
} from "../../../src/session/input/workflows.ts";
import { TARGET_SYMBOL_KINDS } from "../../../src/session/target-input.ts";

describe("code_find query validation", () => {
  it.each(["text", "regex"] as const)("preserves significant whitespace in %s mode", (mode) => {
    const query = " foo ";
    const outcome = parseFindWorkflowInput({ query, mode });

    expect(outcome.kind).toBe("valid");
    if (outcome.kind === "valid") expect(outcome.value.query).toBe(query);
  });

  it.each(["", "   ", "\t\n"])("rejects an all-whitespace query (%j)", (query) => {
    expect(parseFindWorkflowInput({ query })).toEqual({
      kind: "invalid-input",
      message: "query must not be empty.",
    });
  });
});

describe("symbol-kind validation", () => {
  it.each(TARGET_SYMBOL_KINDS)("accepts LSP SymbolKind %s", (symbolKind) => {
    expect(parseTargetInput({ symbol: { query: "Widget", symbolKind } }, ["symbol"])).toMatchObject(
      { kind: "valid", value: { symbol: { symbolKind } } },
    );
  });

  it("rejects source-language aliases that are not LSP SymbolKinds", () => {
    expect(
      parseTargetInput({ symbol: { query: "Widget", symbolKind: "type" } }, ["symbol"]),
    ).toEqual({
      kind: "invalid-input",
      message:
        "target.symbol.symbolKind must be a provider-reported LSP SymbolKind; omit it when the provider category is uncertain.",
    });
  });
});

describe("session runtime input validation", () => {
  it.each([
    [
      "rejects fractional inspection coordinates",
      () => parseInspectWorkflowInput({ point: { file: "src/a.ts", line: 1.5, character: 1 } }),
    ],
    [
      "rejects an unknown Orientation focus branch",
      () => parseOrientationWorkflowInput({ focus: { package: "supi" } }),
    ],
    [
      "rejects unsupported graph relations",
      () => parseGraphWorkflowInput({ target: { handle: "tg-1" }, relations: ["imports"] }),
    ],
    ["rejects non-boolean health refresh", () => parseHealthWorkflowInput({ refresh: "yes" })],
    [
      "rejects the removed refactor rename alias",
      () =>
        parseRefactorPlanWorkflowInput({
          target: { handle: "tg-1" },
          operation: { rename: { newName: "next" } },
        }),
    ],
    [
      "rejects malformed target anchors",
      () => parseTargetInput({ anchor: { file: "src/a.ts", line: 0, character: 1 } }, ["anchor"]),
    ],
    [
      "rejects unsupported resolve input fields",
      () => parseResolveRequest({ target: { file: "src/a.ts" }, legacy: true }),
    ],
  ])("%s", (_name, parse) => {
    const outcome = parse();

    expect(outcome.kind).toBe("invalid-input");
  });
});
