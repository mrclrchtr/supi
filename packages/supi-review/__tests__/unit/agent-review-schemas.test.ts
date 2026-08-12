import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import { parseRunReviewToolInput, runReviewSchema } from "../../src/tool/agent-review-schemas.ts";
import { reviewInputSchema, reviewSubmissionSchema } from "../../src/tool/schemas.ts";

const tasks = [{ id: "spec", instructions: "Check the spec.", mode: "change" }];

describe("agent review schemas", () => {
  it("publishes one flat exact-target request without a direct wrapper", () => {
    const publishedSchema = JSON.stringify(runReviewSchema);

    expect(publishedSchema).toContain('"target"');
    expect(publishedSchema).toContain('"paths"');
    expect(publishedSchema).toContain('"from"');
    expect(publishedSchema).toContain('"to"');
    // biome-ignore lint/security/noSecrets: Schema field name assertion.
    expect(publishedSchema).toContain('"includeUncommittedChanges"');
    expect(publishedSchema).not.toContain('"direct"');
    expect(publishedSchema).not.toContain('"kind"');
    expect(publishedSchema).not.toContain("workingTree");
    expect(publishedSchema).not.toContain("comparison");
    expect(publishedSchema).not.toContain("currentState");
    expect(publishedSchema).not.toContain("prepared");
    expect(publishedSchema).not.toContain("planId");
    expect(publishedSchema).not.toContain("findingScope");
  });

  it("requires a Review Mode for every task", () => {
    expect(Value.Check(reviewInputSchema, { tasks })).toBe(true);
    expect(
      Value.Check(reviewInputSchema, { tasks: [{ id: "spec", instructions: "Check." }] }),
    ).toBe(false);
    expect(() =>
      parseRunReviewToolInput({ tasks: [{ id: "spec", instructions: "Check." }] }),
    ).toThrow("Review task mode is required: change or state.");
    expect(
      Value.Check(reviewInputSchema, {
        tasks: [{ id: "spec", instructions: "Check.", mode: "change-only" }],
      }),
    ).toBe(false);
  });

  it("accepts omitted and empty targets as the current filesystem", () => {
    expect(parseRunReviewToolInput({ tasks })).toEqual({
      target: {},
      scope: {},
      review: { tasks },
    });
    expect(parseRunReviewToolInput({ target: {}, tasks })).toEqual({
      target: {},
      scope: {},
      review: { tasks },
    });
  });

  it("preserves a flat exact target for later endpoint resolution", () => {
    expect(
      parseRunReviewToolInput({
        target: { from: "topic~1", to: "release", includeUncommittedChanges: false },
        sharedContext: "Issue #287.",
        tasks,
      }),
    ).toEqual({
      target: { from: "topic~1", to: "release", includeUncommittedChanges: false },
      scope: {},
      review: { sharedContext: "Issue #287.", tasks },
    });
  });

  it("normalizes and bounds optional batch Review Scope paths", () => {
    expect(
      parseRunReviewToolInput({
        paths: [" ./src/a.ts ", "src/a.ts", "@docs", "docs/"],
        tasks,
      }),
    ).toMatchObject({ scope: { paths: ["src/a.ts", "docs"] } });
    expect(() =>
      parseRunReviewToolInput({
        paths: Array.from({ length: 17 }, (_, index) => `src/${index}`),
        tasks,
      }),
    ).toThrow();
    expect(() => parseRunReviewToolInput({ paths: ["../outside"], tasks })).toThrow(/stay inside/i);
  });

  it.each([
    { workingTree: {} },
    { comparison: { baseCommit: "main" } },
    { commit: { commit: "HEAD" } },
    { currentState: {} },
    { kind: "working-tree" },
  ])("rejects the old Review Target %o", (target) => {
    expect(() => parseRunReviewToolInput({ target, tasks })).toThrow(
      "Review Target must use only from, to, and includeUncommittedChanges.",
    );
  });

  it.each(["change-only", "boy-scout", "criteria-only"])(
    "rejects the removed Finding Scope value %s",
    (findingScope) => {
      const input = {
        tasks: [{ id: "state", instructions: "Check.", mode: "state", findingScope }],
      };
      expect(Value.Check(reviewInputSchema, input)).toBe(false);
      expect(() => parseRunReviewToolInput(input)).toThrow(
        "Review task findingScope is removed; set mode to change or state.",
      );
    },
  );

  it("rejects the removed direct wrapper", () => {
    expect(() => parseRunReviewToolInput({ direct: { tasks } })).toThrow(
      "Review input must not use the removed direct wrapper.",
    );
  });

  it.each([
    { prepared: { planId: "plan-1" }, tasks },
    { plan: {}, tasks },
    { planId: "plan-1", tasks },
    { draftDecision: {}, tasks },
    { planning: {}, tasks },
    { preparation: {}, tasks },
    { prepare: {}, tasks },
  ])("rejects removed Prepared Review input", (input) => {
    expect(() => parseRunReviewToolInput(input)).toThrow(
      "Review input must not use removed Prepared Review fields.",
    );
  });

  it.each(["criteriaOnly", "scope"])("rejects the removed task policy field %s", (field) => {
    const input = {
      tasks: [{ id: "state", instructions: "Check.", mode: "state", [field]: "criteria-only" }],
    };

    expect(() => parseRunReviewToolInput(input)).toThrow(
      "Review task Finding Scope is removed; set mode to change or state.",
    );
  });

  it.each(["findingScope", "mode"])(
    "rejects the removed top-level task policy field %s",
    (field) => {
      expect(() => parseRunReviewToolInput({ [field]: "change-only", tasks })).toThrow(
        "Review input must not use removed Finding Scope fields.",
      );
    },
  );

  it.each(["from", "to"] as const)(
    "reports a blank Review Target %s endpoint before target normalization",
    (endpoint) => {
      const input = { target: { [endpoint]: " ", includeUncommittedChanges: false }, tasks };

      expect(Value.Check(runReviewSchema, input)).toBe(false);
      expect(() => parseRunReviewToolInput(input)).toThrow(
        `Review Target ${endpoint} must not be blank.`,
      );
    },
  );

  it.each(["from", "to"] as const)(
    "rejects whitespace inside Review Target %s endpoint syntax",
    (endpoint) => {
      for (const revision of ["HEAD ^", "HEAD\n"]) {
        const input = {
          target: { [endpoint]: revision, includeUncommittedChanges: false },
          tasks,
        };

        expect(() => parseRunReviewToolInput(input)).toThrow(
          `Review Target ${endpoint} must not contain whitespace.`,
        );
      }
    },
  );

  it("rejects target and task cross-field conflicts", () => {
    expect(() =>
      parseRunReviewToolInput({
        target: { to: "HEAD" },
        tasks,
      }),
    ).toThrow(/includeUncommittedChanges/i);
    expect(() =>
      parseRunReviewToolInput({
        target: { includeUncommittedChanges: false },
        tasks,
      }),
    ).toThrow(/explicit from/i);
    expect(() =>
      parseRunReviewToolInput({
        target: { from: "HEAD" },
        tasks: [{ id: "state", instructions: "Check.", mode: "state" }],
      }),
    ).toThrow(/all-state/i);
  });

  it("rejects blank caller and reviewer text in provider-visible schemas", () => {
    expect(
      Value.Check(reviewInputSchema, {
        tasks: [{ id: " ", instructions: "Review.", mode: "change" }],
      }),
    ).toBe(false);
    expect(
      Value.Check(reviewInputSchema, {
        tasks: [{ id: "spec", instructions: " \n", mode: "change" }],
      }),
    ).toBe(false);
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
  });
});
