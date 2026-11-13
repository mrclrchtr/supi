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
  it.each(["ast", "semantic"] as const)("preserves significant whitespace in %s mode", (mode) => {
    const query = " foo ";
    const search =
      mode === "ast" ? { ast: { kind: "definition", query } } : { semantic: { query } };

    expect(parseFindWorkflowInput({ search })).toEqual({ kind: "valid", value: { search } });
  });

  it.each(["", "   ", "\t\n"])("rejects an all-whitespace query (%j)", (query) => {
    expect(parseFindWorkflowInput({ search: { semantic: { query } } })).toEqual({
      kind: "invalid-input",
      message: "search.semantic.query must not be empty.",
    });
  });

  it.each([
    {},
    { text: { query: "Widget" } },
    { ast: { kind: "definition", query: "Widget" }, semantic: { query: "Widget" } },
  ])("rejects a search that does not select exactly one supported mode: %j", (search) => {
    expect(parseFindWorkflowInput({ search })).toMatchObject({ kind: "invalid-input" });
  });

  it("rejects an AST kind on a semantic search", () => {
    expect(
      parseFindWorkflowInput({ search: { semantic: { query: "Widget", kind: "definition" } } }),
    ).toEqual({
      kind: "invalid-input",
      message: "search.semantic contains unsupported field: `kind`.",
    });
  });

  it("rejects removed contextLines input", () => {
    expect(
      parseFindWorkflowInput({ search: { semantic: { query: "Widget" } }, contextLines: 2 }),
    ).toEqual({
      kind: "invalid-input",
      message: "code_find input contains unsupported field: `contextLines`.",
    });
  });

  it("accepts duplicate scopes for canonical path deduplication", () => {
    expect(
      parseFindWorkflowInput({ search: { semantic: { query: "Widget" } }, scopes: ["src", "src"] }),
    ).toMatchObject({ kind: "valid", value: { scopes: ["src", "src"] } });
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
  it.each(["coverage", "unused"])("rejects removed health section %s", (section) => {
    expect(parseHealthWorkflowInput({ include: [section] })).toEqual({
      kind: "invalid-input",
      message: "include contains an unsupported or duplicate health section.",
    });
  });

  it.each(["coveragePath", "unusedPath"])("rejects removed health path field %s", (field) => {
    const outcome = parseHealthWorkflowInput({ [field]: "report.json" });

    expect(outcome.kind).toBe("invalid-input");
    if (outcome.kind === "invalid-input") {
      expect(outcome.message).toContain(`unsupported field: \`${field}\``);
    }
  });

  it("accepts a source action without a symbol target", () => {
    expect(
      parseRefactorPlanWorkflowInput({
        operation: { source_action: { file: "src/a.ts", kind: "source.organizeImports" } },
      }),
    ).toEqual({
      kind: "valid",
      value: { operation: { source_action: { file: "src/a.ts", kind: "source.organizeImports" } } },
    });
  });

  it.each([
    [
      "rejects fractional inspection coordinates",
      () => parseInspectWorkflowInput({ anchor: { file: "src/a.ts", line: 1.5, character: 1 } }),
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
          operation: { rename: { target: { handle: "tg-1" }, newName: "next" } },
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
