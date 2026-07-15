import { initTheme } from "@earendil-works/pi-coding-agent";
import { beforeAll, describe, expect, it } from "vitest";
import { renderOrientationResult as renderOrientationMarkdown } from "../../../src/tool/orientation/markdown.ts";
import { renderOrientationResult as renderOrientationTui } from "../../../src/tool/orientation/tui.ts";
import { assembleOrientationResult } from "../../../src/tool/result/orientation.ts";

const testTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

beforeAll(() => initTheme("dark"));

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

    const markdown = renderOrientationMarkdown(assembly);

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

  it.each([
    false,
    true,
  ])("does not invent orientation bounds when assembled evidence is absent and expanded is %s", (expanded) => {
    const rendered = renderOrientationTui(
      {
        content: [{ type: "text", text: "# Multiple Orientation targets" }],
        details: {
          type: "context",
          data: {
            confidence: "semantic",
            candidates: [{ name: "first" }],
          },
        },
      },
      { expanded, isPartial: false },
      testTheme,
      undefined,
    );

    const text = rendered.render(120).join("\n");
    expect(text).toContain("confidence semantic");
    expect(text).not.toContain("0 sections");
  });
});
