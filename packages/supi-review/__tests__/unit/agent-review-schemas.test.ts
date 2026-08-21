import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  parseRunReviewToolInput,
  runReviewSchema,
} from "../../src/tool/review_run/input-schema.ts";
import { reviewInputSchema, reviewSubmissionSchema } from "../../src/tool/review_run/schemas.ts";

const tasks = [{ id: "spec", instructions: "Check the spec.", mode: "change" }];

describe("agent review schemas", () => {
  it("publishes explicit working-tree and committed target sources", () => {
    const publishedSchema = JSON.stringify(runReviewSchema);

    expect(publishedSchema).toContain('"target"');
    expect(publishedSchema).toContain('"paths"');
    expect(publishedSchema).toContain('"from"');
    expect(publishedSchema).toContain('"to"');
    expect(publishedSchema).toContain('"workingTree"');
    expect(publishedSchema).toContain('"committed"');
    expect(publishedSchema).toContain("Review the frozen current filesystem");
    expect(publishedSchema).toContain("Review exact committed Git state");
    // biome-ignore lint/security/noSecrets: Removed schema field name assertion.
    expect(publishedSchema).not.toContain('"includeUncommittedChanges"');
    expect(publishedSchema).not.toContain('"direct"');
    expect(publishedSchema).not.toContain('"kind"');
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

  it("preserves the explicit committed target source for later endpoint resolution", () => {
    expect(
      parseRunReviewToolInput({
        target: { committed: { from: "topic~1", to: "release" } },
        sharedContext: "Issue #287.",
        tasks,
      }),
    ).toEqual({
      target: { committed: { from: "topic~1", to: "release" } },
      scope: {},
      review: { sharedContext: "Issue #287.", tasks },
    });
  });

  it("keeps target source objects mutually exclusive and closed", () => {
    expect(
      Value.Check(runReviewSchema, {
        target: { committed: { from: "base", to: "HEAD" } },
        tasks,
      }),
    ).toBe(true);
    expect(
      Value.Check(runReviewSchema, {
        target: { workingTree: { to: "HEAD" } },
        tasks,
      }),
    ).toBe(false);
    expect(
      Value.Check(runReviewSchema, {
        target: { workingTree: {}, committed: {} },
        tasks,
      }),
    ).toBe(false);
    expect(() =>
      parseRunReviewToolInput({ target: { workingTree: {}, committed: {} }, tasks }),
    ).toThrow("Review Target must select at most one of workingTree or committed.");
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
    { from: "main" },
    { to: "HEAD" },
    { includeUncommittedChanges: true },
    { comparison: { baseCommit: "main" } },
    { commit: { commit: "HEAD" } },
    { currentState: {} },
    { kind: "working-tree" },
  ])("rejects the flat or old Review Target %o", (target) => {
    expect(() => parseRunReviewToolInput({ target, tasks })).toThrow(
      "Review Target must select a workingTree or committed target object.",
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

  it.each([
    { target: { workingTree: { from: " " } }, endpoint: "workingTree.from" },
    { target: { committed: { to: " " } }, endpoint: "committed.to" },
  ])(
    "reports a blank Review Target $endpoint before target normalization",
    ({ target, endpoint }) => {
      const input = { target, tasks };

      expect(Value.Check(runReviewSchema, input)).toBe(false);
      expect(() => parseRunReviewToolInput(input)).toThrow(
        `Review Target ${endpoint} must not be blank.`,
      );
    },
  );

  it("rejects paths placed inside the Review Target with a top-level guidance error", () => {
    expect(() => parseRunReviewToolInput({ target: { paths: ["src/a.ts"] }, tasks })).toThrow(
      "Review paths must be a top-level argument, not part of the Review Target.",
    );
    expect(() => parseRunReviewToolInput({ paths: ["src/a.ts"], target: {}, tasks })).not.toThrow();
  });

  it.each([
    { target: { workingTree: { from: "HEAD ^" } }, endpoint: "workingTree.from" },
    { target: { committed: { to: "HEAD\n" } }, endpoint: "committed.to" },
  ])("rejects whitespace inside Review Target $endpoint syntax", ({ target, endpoint }) => {
    expect(() => parseRunReviewToolInput({ target, tasks })).toThrow(
      `Review Target ${endpoint} must not contain whitespace.`,
    );
  });

  it("rejects target and task cross-field conflicts", () => {
    expect(() =>
      parseRunReviewToolInput({
        target: { committed: { to: "HEAD" } },
        tasks,
      }),
    ).toThrow(/explicit from/i);
    expect(() =>
      parseRunReviewToolInput({
        target: { committed: {} },
        tasks,
      }),
    ).toThrow(/explicit from/i);
    expect(() =>
      parseRunReviewToolInput({
        target: { workingTree: { from: "HEAD" } },
        tasks: [{ id: "state", instructions: "Check.", mode: "state" }],
      }),
    ).toThrow(/all-state/i);
  });

  it("rejects a working-tree target with a committed after endpoint", () => {
    expect(() =>
      parseRunReviewToolInput({
        target: { workingTree: { to: "HEAD" } },
        tasks,
      }),
    ).toThrow("Review Target workingTree field to is not supported.");
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
