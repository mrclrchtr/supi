import { describe, expect, it } from "vitest";
import { renderOrientationResult } from "../../../src/tool/orientation/markdown.ts";
import { assembleOrientationResult } from "../../../src/tool/result/orientation.ts";

describe("Orientation result projections", () => {
  it("projects assembled read-next actions into markdown and structured details", () => {
    const readNext = {
      file: "src/index.ts",
      startLine: 4,
      endLine: 12,
      reason: "inspect the entrypoint",
    };
    const assembly = assembleOrientationResult({
      blocks: [{ kind: "heading", level: 1, text: "Project" }],
      confidence: "structural",
      focusTarget: null,
      requestedSections: [],
      renderedSections: ["orientation"],
      omittedCount: 0,
      nextQueries: ['Use code_orientation with focus.module "app"'],
      readNext: [readNext],
    });

    const markdown = renderOrientationResult(assembly);

    expect(markdown).toContain("## Read Next");
    expect(markdown).toContain("`src/index.ts` L4–L12");
    expect(markdown).toContain("read` offset 4, limit 9");
    expect(assembly.assembled.actions).toContainEqual({ kind: "read-next", ...readNext });
    expect(assembly.details).toMatchObject({
      confidence: "structural",
      nextQueries: ['Use code_orientation with focus.module "app"'],
      readNext: [readNext],
    });
  });
});
