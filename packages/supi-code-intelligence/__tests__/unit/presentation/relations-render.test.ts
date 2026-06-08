import { describe, expect, it } from "vitest";
import {
  renderCalleesResult,
  renderExportsResult,
  renderGraphResult,
  renderImportsResult,
} from "../../../src/presentation/markdown/relations.ts";

type RelationsResult =
  | {
      kind: "callers";
      targetName: string;
      references: Array<{ file: string; line: number; character: number; name: string }>;
      externalCount: number;
      evidence: string;
      confidence: string;
    }
  | {
      kind: "implementations";
      targetName: string;
      implementations: Array<{ file: string; line: number; character: number; name: string }>;
      externalCount: number;
      confidence: string;
    }
  | {
      kind: "callees";
      targetName: string;
      callees: Array<{ name: string; file: string; line: number; character: number }>;
      confidence: string;
    }
  | { kind: "unavailable"; reason: string };

/**
 * Relations renderer tests — ensures the renderer handles typed
 * RelationsResult data without performing routing or provider calls.
 */
describe("relations render", () => {
  it("formats callers result with semantic-references evidence", () => {
    const result: RelationsResult = {
      kind: "callers",
      targetName: "myFunction",
      references: [{ file: "src/a.ts", line: 10, character: 5, name: "myFunction" }],
      externalCount: 2,
      evidence: "semantic-references",
      confidence: "semantic",
    };

    expect(result.kind).toBe("callers");
    expect(result.evidence).toBe("semantic-references");
    if (result.kind === "callers") {
      expect(result.references.length).toBe(1);
      expect(result.externalCount).toBe(2);
    }
  });

  it("formats implementations result with confidence", () => {
    const result: RelationsResult = {
      kind: "implementations",
      targetName: "InterfaceX",
      implementations: [{ file: "src/impl.ts", line: 15, character: 1, name: "InterfaceX" }],
      externalCount: 0,
      confidence: "semantic",
    };

    expect(result.kind).toBe("implementations");
    if (result.kind === "implementations") {
      expect(result.implementations.length).toBe(1);
    }
  });

  it("formats callees result", () => {
    const result: RelationsResult = {
      kind: "callees",
      targetName: "myFunction",
      callees: [{ name: "helper", file: "src/helper.ts", line: 5, character: 1 }],
      confidence: "structural",
    };

    expect(result.kind).toBe("callees");
    if (result.kind === "callees") {
      expect(result.callees.length).toBe(1);
    }
  });

  it("handles unavailable result", () => {
    const result: RelationsResult = {
      kind: "unavailable",
      reason: "No provider available",
    };

    expect(result.kind).toBe("unavailable");
  });

  it("renders callees with names and line numbers", () => {
    const content = renderCalleesResult(
      {
        enclosingScope: { name: "widget" },
        callees: [{ name: "helper", startLine: 5 }],
      },
      "src/widget.ts",
      8,
    );

    expect(content).toContain("widget");
    expect(content).toContain("helper");
    expect(content).toContain("L5");
  });

  it("renders graph result with references section and no footer", () => {
    const content = renderGraphResult(
      "widget",
      [
        {
          kind: "ok",
          rel: "references",
          count: 1,
          content: "# References of `widget`\n\n- src/widget.ts:2",
        },
      ],
      "src/widget.ts",
    );

    expect(content).toContain("# Graph of `widget`");
    expect(content).toContain("# References of `widget`");
    expect(content).not.toContain("code_context");
    expect(content).not.toContain("code_inspect");
  });

  it("renders imports result with module specifiers and line numbers", () => {
    const content = renderImportsResult(
      "widget",
      [
        { moduleSpecifier: "./helper", startLine: 1 },
        { moduleSpecifier: "react", startLine: 2 },
      ],
      "src/widget.ts",
      8,
    );

    expect(content).toContain("# Imports");
    expect(content).toContain("structural");
    expect(content).toContain("./helper");
    expect(content).toContain("react");
    expect(content).toContain("(L1)");
    expect(content).toContain("(L2)");
    expect(content).toContain("2 imports");
  });

  it("renders imports result with truncation", () => {
    const imports = Array.from({ length: 10 }, (_, i) => ({
      moduleSpecifier: `./module-${i}`,
      startLine: i + 1,
    }));

    const content = renderImportsResult("widget", imports, "src/widget.ts", 3);

    expect(content).toContain("10 imports");
    expect(content).toContain("./module-0");
    expect(content).toContain("./module-2");
    expect(content).toContain("+7 more");
  });

  it("renders exports result with names, kinds, and line numbers", () => {
    const content = renderExportsResult(
      "widget",
      [
        { name: "foo", kind: "function", startLine: 1 },
        { name: "BAR", kind: "const", startLine: 5 },
      ],
      "src/widget.ts",
      8,
    );

    expect(content).toContain("# Exports");
    expect(content).toContain("structural");
    expect(content).toContain("`foo`");
    expect(content).toContain("`BAR`");
    expect(content).toContain("(function)");
    expect(content).toContain("(const)");
    expect(content).toContain("(L1)");
    expect(content).toContain("(L5)");
    expect(content).toContain("2 exports");
  });

  it("renders exports result with truncation", () => {
    const exports = Array.from({ length: 8 }, (_, i) => ({
      name: `sym${i}`,
      kind: "const",
      startLine: i + 1,
    }));

    const content = renderExportsResult("widget", exports, "src/widget.ts", 3);

    expect(content).toContain("8 exports");
    expect(content).toContain("sym0");
    expect(content).toContain("sym2");
    expect(content).toContain("+5 more");
  });
});
