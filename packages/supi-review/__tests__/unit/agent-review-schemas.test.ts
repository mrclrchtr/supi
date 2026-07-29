import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  parsePrepareReviewToolInput,
  parseRunReviewToolInput,
  runReviewSchema,
} from "../../src/tool/agent-review-schemas.ts";
import { reviewInputSchema, reviewSubmissionSchema } from "../../src/tool/schemas.ts";

const commit = "a".repeat(40);
const tasks = [{ id: "spec", instructions: "Check the spec." }];
const direct = {
  direct: {
    target: { comparison: { baseCommit: commit } },
    tasks,
  },
};

describe("agent review schemas", () => {
  it("advertises provider-compatible exact-one selectors", () => {
    const publishedSchema = JSON.stringify(runReviewSchema);

    expect(publishedSchema).toContain('"type":"object"');
    expect(publishedSchema).toContain('"direct"');
    expect(publishedSchema).toContain('"prepared"');
    expect(publishedSchema).toContain('"minProperties":1');
    expect(publishedSchema).toContain('"maxProperties":1');
    expect(publishedSchema).not.toContain('"mode"');
    expect(publishedSchema).not.toContain('"anyOf"');
    expect(publishedSchema).not.toContain('"const"');
  });

  it("makes task payload and draft decisions clear to agents", () => {
    const publishedSchema = JSON.stringify({
      runReviewSchema,
      reviewInputSchema,
      reviewSubmissionSchema,
    });

    expect(publishedSchema).toContain("replaceDraft");
    expect(publishedSchema).toContain("Tasks run independently");
    expect(publishedSchema).toContain("must be at least startLine");
  });

  it("uses the same target selector when preparing a plan", () => {
    expect(
      parsePrepareReviewToolInput({
        target: { commit: { commit: "9510d68" } },
        planning: "suggest",
      }),
    ).toEqual({
      target: { kind: "commit", commit: "9510d68" },
      planning: "suggest",
    });
  });

  it("narrows valid Direct and Prepared requests", () => {
    expect(parseRunReviewToolInput(direct)).toEqual({
      mode: "direct",
      target: { kind: "comparison", baseCommit: commit },
      review: { tasks },
    });
    expect(
      parseRunReviewToolInput({
        prepared: { planId: "plan-1", draftDecision: { useDraft: {} } },
      }),
    ).toEqual({
      mode: "prepared",
      planId: "plan-1",
      decision: { kind: "accept-draft" },
    });
    expect(
      parseRunReviewToolInput({
        prepared: {
          planId: "plan-1",
          draftDecision: { replaceDraft: { tasks } },
        },
      }),
    ).toEqual({
      mode: "prepared",
      planId: "plan-1",
      decision: { kind: "use-review", review: { tasks } },
    });
  });

  it.each([
    {},
    { direct, prepared: { planId: "plan-1", draftDecision: { useDraft: {} } } },
    { prepared: { draftDecision: { useDraft: {} } } },
    { prepared: { planId: "plan-1", draftDecision: {} } },
    {
      prepared: {
        planId: "plan-1",
        draftDecision: { useDraft: {}, replaceDraft: { tasks } },
      },
    },
    { prepared: { planId: "plan-1", draftDecision: { accept: {} } } },
    { mode: "direct", target: { kind: "working-tree" }, review: { tasks } },
  ])("rejects invalid or legacy execution shapes", (input) => {
    expect(() => parseRunReviewToolInput(input)).toThrow();
  });

  it("defaults a Direct Review target to the working tree", () => {
    expect(parseRunReviewToolInput({ direct: { tasks } })).toEqual({
      mode: "direct",
      target: { kind: "working-tree" },
      review: { tasks },
    });
  });

  it("requires exactly one structurally valid target", () => {
    expect(
      parseRunReviewToolInput({
        direct: { target: { workingTree: { baseCommit: "9510d68" } }, tasks },
      }),
    ).toEqual({
      mode: "direct",
      target: { kind: "working-tree", baseCommit: "9510d68" },
      review: { tasks },
    });
    expect(
      parseRunReviewToolInput({
        direct: { target: { commit: { commit: "9510d68" } }, tasks },
      }),
    ).toEqual({
      mode: "direct",
      target: { kind: "commit", commit: "9510d68" },
      review: { tasks },
    });

    expect(() =>
      parseRunReviewToolInput({
        direct: {
          target: { workingTree: {}, comparison: { baseCommit: commit } },
          tasks,
        },
      }),
    ).toThrow();
    expect(() =>
      parseRunReviewToolInput({
        direct: { target: { comparison: { commit } }, tasks },
      }),
    ).toThrow();
  });

  it("rejects blank caller and reviewer text in the provider-visible schemas", () => {
    expect(() =>
      parseRunReviewToolInput({
        direct: {
          target: { workingTree: {} },
          tasks: [{ id: " ", instructions: "Review." }],
        },
      }),
    ).toThrow();
    expect(() =>
      parseRunReviewToolInput({
        direct: {
          target: { workingTree: {} },
          tasks: [{ id: "spec", instructions: " \n" }],
        },
      }),
    ).toThrow();

    expect(Value.Check(reviewInputSchema, { sharedContext: " \n", tasks })).toBe(false);

    const finding = {
      title: "Finding",
      description: "Evidence.",
      blocksAcceptance: true,
      impact: "high" as const,
      effort: "small" as const,
      confidence: 1,
    };
    expect(Value.Check(reviewSubmissionSchema, { summary: " ", findings: [] })).toBe(false);
    expect(
      Value.Check(reviewSubmissionSchema, {
        summary: "Review finished.",
        findings: [{ ...finding, title: " " }],
      }),
    ).toBe(false);
    expect(
      Value.Check(reviewSubmissionSchema, {
        summary: "Review finished.",
        findings: [{ ...finding, description: " \n" }],
      }),
    ).toBe(false);
    expect(
      Value.Check(reviewSubmissionSchema, {
        summary: "Review finished.",
        findings: [
          {
            ...finding,
            location: { path: "src/file.ts", startLine: 10 },
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts per-task finding scope and rejects unknown values", () => {
    expect(
      parseRunReviewToolInput({
        direct: {
          target: { workingTree: {} },
          tasks: [
            {
              id: "cleanup",
              instructions: "Take Boy Scout responsibility.",
              findingScope: "boy-scout",
            },
          ],
        },
      }),
    ).toEqual({
      mode: "direct",
      target: { kind: "working-tree" },
      review: {
        tasks: [
          {
            id: "cleanup",
            instructions: "Take Boy Scout responsibility.",
            findingScope: "boy-scout",
          },
        ],
      },
    });

    expect(() =>
      parseRunReviewToolInput({
        direct: {
          target: { workingTree: {} },
          tasks: [{ id: "cleanup", instructions: "Review.", findingScope: "repository-wide" }],
        },
      }),
    ).toThrow();
  });
});
