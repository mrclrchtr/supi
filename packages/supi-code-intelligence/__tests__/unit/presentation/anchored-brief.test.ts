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
    definition: null,
    codeActions: null,
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

  // ── Definition section ──────────────────────────────────────────

  it("renders definition section when definition data is present", () => {
    const context = defaultContext({
      definition: [
        {
          uri: "file:///project/src/lib.ts",
          range: {
            start: { line: 9, character: 4 },
            end: { line: 9, character: 10 },
          },
        },
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

    expect(result.content).toContain("## Definition");
    // 0-based → 1-based display
    expect(result.content).toContain("/project/src/lib.ts:10:5");
  });

  it("renders definition section with file:// URI decoded", () => {
    const context = defaultContext({
      definition: [
        {
          uri: "file:///home/user/project/src/helper.ts",
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
          },
        },
      ],
    });

    const result = renderAnchoredBrief({
      relPath: "src/index.ts",
      line: 1,
      character: 1,
      context,
      model: null,
      details: {
        confidence: "structural",
        focusTarget: "src/index.ts:1:1",
        startHere: [],
        publicSurfaces: [],
        dependencySummary: null,
        omittedCount: 0,
        nextQueries: [],
      },
      cwd: "/project",
    });

    expect(result.content).toContain("## Definition");
    expect(result.content).toContain("/home/user/project/src/helper.ts:1:1");
  });

  it("does not render definition section when definition is null", () => {
    const context = defaultContext({ definition: null });

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

    expect(result.content).not.toContain("## Definition");
  });

  it("does not render definition section when definition is empty", () => {
    const context = defaultContext({ definition: [] });

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

    expect(result.content).not.toContain("## Definition");
  });

  // ── Code Actions section ─────────────────────────────────────────

  it("renders code actions section when codeActions data is present", () => {
    const context = defaultContext({
      codeActions: [
        { title: "Remove unused import", kind: "quickfix" },
        { title: "Add missing return type" },
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

    expect(result.content).toContain("## Code Actions");
    expect(result.content).toContain('"Remove unused import"');
    expect(result.content).toContain("(quickfix)");
    expect(result.content).toContain('"Add missing return type"');
  });

  it("does not render code actions section when codeActions is null", () => {
    const context = defaultContext({ codeActions: null });

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

    expect(result.content).not.toContain("## Code Actions");
  });

  it("does not render code actions section when codeActions is empty", () => {
    const context = defaultContext({ codeActions: [] });

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

    expect(result.content).not.toContain("## Code Actions");
  });

  it("renders code actions without kind label when kind is undefined", () => {
    const context = defaultContext({
      codeActions: [{ title: "Fix all" }],
    });

    const result = renderAnchoredBrief({
      relPath: "src/index.ts",
      line: 1,
      character: 1,
      context,
      model: null,
      details: {
        confidence: "structural",
        focusTarget: "src/index.ts:1:1",
        startHere: [],
        publicSurfaces: [],
        dependencySummary: null,
        omittedCount: 0,
        nextQueries: [],
      },
      cwd: "/project",
    });

    expect(result.content).toContain('"Fix all"');
    // No kind label means no parentheses after the title
    // Just check it doesn't crash — the kind label is empty string when undefined
  });
});
