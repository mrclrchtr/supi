import { initTheme } from "@earendil-works/pi-coding-agent";
import { beforeAll, describe, expect, it } from "vitest";
import type { OrientationResultData } from "../../../src/session/orientation-types.ts";
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
      title: "Project",
      notes: [],
      sections: [
        {
          key: "orientation",
          title: "orientation",
          status: "complete",
          reason: null,
          confidence: "structural",
          provenance: [{ source: "structural", capability: "test" }],
          evidenceLists: [],
          items: [],
        },
      ],
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

  it.each([false, true])(
    "does not invent orientation bounds when assembled evidence is absent and expanded is %s",
    (expanded) => {
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
    },
  );

  it("frames title, notes, focus, section notes, and items from Orientation facts", () => {
    const target = {
      targetId: "tg-1",
      spanId: "sp-1",
      file: "src/widget.ts",
      displayLine: 1,
      displayCharacter: 1,
      name: "widget",
    } as unknown as NonNullable<OrientationResultData["target"]>;

    const markdown = renderOrientationMarkdown(
      assembleOrientationResult({
        title: "Code Orientation",
        notes: ["Resolved target widget: src/widget.ts:1:1 — Target ID: tg-1"],
        sections: [
          {
            key: "defs",
            title: "Definitions",
            status: "complete",
            reason: null,
            confidence: "semantic",
            provenance: [{ source: "semantic", capability: "LSP" }],
            evidenceLists: [],
            items: [
              { kind: "list-item", text: "Focus: `src/widget.ts:1:1`" },
              { kind: "code", language: "ts", lines: ["function widget(): number"] },
            ],
          },
          {
            key: "instructions",
            title: "Instructions",
            status: "complete",
            reason: null,
            confidence: "unavailable",
            provenance: [{ source: "filesystem", detail: "configured instruction files" }],
            evidenceLists: [],
            items: [{ kind: "subheading", text: "AGENTS.md" }],
          },
        ],
        confidence: "semantic",
        focusTarget: "src/widget.ts:1:1",
        requestedSections: ["defs"],
        renderedSections: ["defs", "instructions"],
        omittedCount: 0,
        nextQueries: [],
        readNext: [],
        target,
      }),
    );

    expect(markdown).toContain("Resolved target widget: src/widget.ts:1:1 — Target ID: tg-1");
    expect(markdown).toContain("# Code Orientation");
    expect(markdown).toContain("## Focus\n- `src/widget.ts:1:1`");
    expect(markdown).toContain("## Definitions");
    expect(markdown).toContain("- Focus: `src/widget.ts:1:1`");
    expect(markdown).toContain("```ts\nfunction widget(): number\n```");
    expect(markdown).toContain("## Instructions");
    expect(markdown).toContain("### AGENTS.md");
  });
});
