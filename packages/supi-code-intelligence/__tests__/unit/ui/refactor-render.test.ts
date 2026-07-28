import { initTheme } from "@earendil-works/pi-coding-agent";
import { beforeAll, describe, expect, it } from "vitest";
import type { ApplyResult } from "../../../src/analysis/refactor/apply.ts";
import type { RefactorPlan } from "../../../src/session/refactor-plans.ts";
import { renderRefactorApplyResult as renderRefactorApplyTui } from "../../../src/tool/refactor-apply/tui.ts";
import {
  renderRefactorApplyResult as renderRefactorApplyMarkdown,
  renderRefactorPlanResult as renderRefactorPlanMarkdown,
} from "../../../src/tool/refactor-plan/markdown.ts";
import { renderRefactorPlanResult as renderRefactorPlanTui } from "../../../src/tool/refactor-plan/tui.ts";
import {
  assembleRefactorApplyDetails,
  assembleRefactorPlanDetails,
} from "../../../src/tool/result/refactor.ts";

const testTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

beforeAll(() => initTheme("dark"));

function makePlan(): RefactorPlan {
  return {
    id: "plan-1",
    operation: "rename_symbol",
    newName: "newName",
    targetFile: "/repo/src/index.ts",
    targetLine: 1,
    targetCharacter: 1,
    edits: {
      edits: Array.from({ length: 3 }, (_, index) => ({
        file: "/repo/src/index.ts",
        range: {
          start: { line: index, character: 0 },
          end: { line: index, character: 7 },
        },
        newText: `newName${index}`,
      })),
    },
    fileFingerprints: [],
    createdAt: 0,
  };
}

describe("refactor result projections", () => {
  it("uses assembled edit evidence and actions for markdown and details", () => {
    const assembly = assembleRefactorPlanDetails(makePlan(), "/repo", 2);
    const markdown = renderRefactorPlanMarkdown(assembly);

    expect(markdown).toContain("**Confidence:** `semantic`");
    expect(markdown).toContain("L1:1 → L1:8");
    expect(markdown).toContain("newName0");
    expect(markdown).toContain("newName1");
    expect(markdown).not.toContain("newName2");
    expect(markdown).toContain("_(showing 2 of 3; 1 omitted)_");
    expect(markdown).toContain(assembly.details.nextQueries[0]);
    expect(assembly.details).toMatchObject({
      confidence: "semantic",
      candidateCount: 3,
      omittedCount: 1,
      evidenceLists: [
        {
          key: "refactor.edits",
          totalCount: 3,
          shownCount: 2,
          omittedCount: 1,
          partialReason: null,
        },
      ],
    });
  });

  it("projects apply facts and assembled follow-up actions", () => {
    const plan = makePlan();
    const applyResult: ApplyResult = { kind: "applied", filesChanged: 1, totalEdits: 3 };
    const assembly = assembleRefactorApplyDetails(applyResult, plan);
    const markdown = renderRefactorApplyMarkdown(assembly);

    expect(markdown).toContain("Plan: `plan-1`");
    expect(markdown).toContain("Operation: `rename_symbol`");
    expect(markdown).toContain("Total edits: 3");
    expect(markdown).toContain(assembly.details.nextQueries[0]);
    expect(assembly.details.changedFiles).toEqual(["/repo/src/index.ts"]);
    expect(assembly.assembled.data.result).toBe(applyResult);
  });

  it("does not report an unavailable apply as successful in compact TUI", () => {
    const rendered = renderRefactorApplyTui(
      {
        content: [{ type: "text", text: "**Error:** Plan was not found" }],
        details: { type: "search", data: { confidence: "unavailable" } },
      },
      { expanded: false, isPartial: false },
      testTheme,
      undefined,
    );

    const text = rendered.render(120).join("\n");
    expect(text).toContain("Refactor apply failed");
    expect(text).not.toContain("Plan applied");

    const successful = renderRefactorApplyTui(
      {
        content: [{ type: "text", text: "**Refactor applied successfully.**" }],
        details: { type: "search", data: { confidence: "semantic" } },
      },
      { expanded: false, isPartial: false },
      testTheme,
      undefined,
    );
    expect(successful.render(120).join("\n")).toContain("Plan applied");
  });

  it.each([false, true])("uses structured edit bounds when expanded is %s", (expanded) => {
    const rendered = renderRefactorPlanTui(
      {
        content: [{ type: "text", text: "_(showing 2 of 3; 1 omitted)_" }],
        details: {
          type: "search",
          data: {
            confidence: "semantic",
            candidateCount: 3,
            omittedCount: 1,
            evidenceLists: [
              {
                key: "refactor.edits",
                totalCount: 3,
                shownCount: 2,
                omittedCount: 1,
                partialReason: null,
              },
            ],
          },
        },
      },
      { expanded, isPartial: false },
      testTheme,
      undefined,
    );

    const text = rendered.render(120).join("\n");
    expect(text).toContain("2 of 3 edits (1 omitted)");
    if (expanded) expect(text).toContain("showing 2 of 3; 1 omitted");
  });
});
