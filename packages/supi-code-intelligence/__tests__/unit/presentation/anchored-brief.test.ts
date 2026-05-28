/**
 * Unit tests for renderAnchoredBrief — verifies markdown output for
 * anchored briefs including the new hover section.
 */

import { describe, expect, it } from "vitest";
import { renderAnchoredBrief } from "../../../src/presentation/markdown/brief.ts";

function defaultContext(overrides: Record<string, unknown> = {}) {
  return {
    nodeInfo: null,
    outline: [],
    imports: [],
    exports: [],
    hover: null,
    ...overrides,
  };
}

describe("renderAnchoredBrief", () => {
  it("renders anchored brief with hover section when hover data is present", () => {
    const context = defaultContext({
      hover: { contents: "const x: number" },
    });

    const result = renderAnchoredBrief({
      relPath: "src/index.ts",
      line: 5,
      character: 10,
      context,
      model: null,
      details: {
        confidence: "structural",
        focusTarget: "src/index.ts:5:10",
        startHere: [],
        publicSurfaces: [],
        dependencySummary: null,
        omittedCount: 0,
        nextQueries: [],
      },
      cwd: "/project",
    });

    expect(result.content).toContain("## Hover");
    expect(result.content).toContain("```");
    expect(result.content).toContain("const x: number");
    expect(result.content).toContain("```");
  });

  it("renders anchored brief without hover section when hover is null", () => {
    const context = defaultContext({ hover: null });

    const result = renderAnchoredBrief({
      relPath: "src/index.ts",
      line: 5,
      character: 10,
      context,
      model: null,
      details: {
        confidence: "structural",
        focusTarget: "src/index.ts:5:10",
        startHere: [],
        publicSurfaces: [],
        dependencySummary: null,
        omittedCount: 0,
        nextQueries: [],
      },
      cwd: "/project",
    });

    expect(result.content).not.toContain("## Hover");
  });

  it("renders anchored brief without hover section when hover contents is empty", () => {
    const context = defaultContext({ hover: { contents: "" } });

    const result = renderAnchoredBrief({
      relPath: "src/index.ts",
      line: 5,
      character: 10,
      context,
      model: null,
      details: {
        confidence: "structural",
        focusTarget: "src/index.ts:5:10",
        startHere: [],
        publicSurfaces: [],
        dependencySummary: null,
        omittedCount: 0,
        nextQueries: [],
      },
      cwd: "/project",
    });

    // Empty contents should not render a hover section
    expect(result.content).not.toContain("## Hover");
  });

  it("renders hover section before file outline", () => {
    const context = defaultContext({
      hover: { contents: "const x: number" },
      outline: [
        { name: "myFunc", kind: "function", startLine: 1, endLine: 10 },
        { name: "MyClass", kind: "class", startLine: 12, endLine: 30 },
      ],
    });

    const result = renderAnchoredBrief({
      relPath: "src/index.ts",
      line: 5,
      character: 10,
      context,
      model: null,
      details: {
        confidence: "structural",
        focusTarget: "src/index.ts:5:10",
        startHere: [],
        publicSurfaces: [],
        dependencySummary: null,
        omittedCount: 0,
        nextQueries: [],
      },
      cwd: "/project",
    });

    const hoverIndex = result.content.indexOf("## Hover");
    const outlineIndex = result.content.indexOf("## File Outline");
    expect(hoverIndex).toBeGreaterThan(-1);
    expect(outlineIndex).toBeGreaterThan(-1);
    expect(hoverIndex).toBeLessThan(outlineIndex);
  });
});
