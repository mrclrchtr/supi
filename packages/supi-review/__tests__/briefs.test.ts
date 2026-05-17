import { describe, expect, it } from "vitest";

import { assembleReviewerPrompt, buildDynamicBrief, buildStandardBrief } from "../src/briefs.ts";
import { getProfile, getProfiles } from "../src/profiles.ts";
import type { ReviewTarget } from "../src/types.ts";

describe("profiles", () => {
  it("exports the three starter profiles", () => {
    const profiles = getProfiles();
    expect(profiles).toHaveLength(3);
    expect(profiles.map((p) => p.id)).toEqual(["general", "security", "api-maintainability"]);
  });

  it("each profile has required fields", () => {
    for (const p of getProfiles()) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(typeof p.systemPrompt).toBe("string");
    }
  });

  it("getProfile returns the matching profile", () => {
    const p = getProfile("security");
    expect(p?.id).toBe("security");
  });

  it("getProfile returns undefined for unknown id", () => {
    expect(getProfile("unknown")).toBeUndefined();
  });
});

describe("buildDynamicBrief", () => {
  it("creates a review brief with dynamic mode", () => {
    const brief = buildDynamicBrief({
      summary: "Added user authentication middleware",
      intent: "Secure the API by requiring JWT tokens",
      focus: "Token validation, error handling, edge cases",
    });

    expect(brief.mode).toBe("dynamic");
    expect(brief.summary).toBe("Added user authentication middleware");
    expect(brief.intent).toBe("Secure the API by requiring JWT tokens");
    expect(brief.focus).toBe("Token validation, error handling, edge cases");
    expect(brief.title).toBeTruthy();
  });

  it("generates a title from the summary", () => {
    const brief = buildDynamicBrief({
      summary: "Refactored the database layer",
      intent: "Improve query performance",
      focus: "Performance, correctness",
    });
    expect(brief.title).toContain("Review");
  });
});

describe("buildStandardBrief", () => {
  it("creates a review brief from a profile", () => {
    const brief = buildStandardBrief("security");
    expect(brief.mode).toBe("standard");
    expect(brief.profileId).toBe("security");
    expect(brief.summary).toBeTruthy();
    expect(brief.intent).toBeTruthy();
    expect(brief.focus).toBeTruthy();
  });

  it("throws for unknown profile", () => {
    expect(() => buildStandardBrief("unknown")).toThrow("Unknown profile");
  });
});

describe("assembleReviewerPrompt", () => {
  const sampleDiff = [
    "diff --git a/src/file.ts b/src/file.ts",
    "index abc..def 100644",
    "--- a/src/file.ts",
    "+++ b/src/file.ts",
    "@@ -1,3 +1,4 @@",
    " line1",
    "-old line",
    "+new line",
  ].join("\n");

  const target: ReviewTarget = {
    type: "uncommitted",
    diff: sampleDiff,
  };

  it("includes the summary from the brief in the prompt", () => {
    const brief = buildDynamicBrief({
      summary: "Fixed login validation",
      intent: "Prevent empty credentials",
      focus: "Edge cases, error messages",
    });

    const prompt = assembleReviewerPrompt(brief, target, sampleDiff);
    expect(prompt).toContain("Fixed login validation");
    expect(prompt).toContain("Prevent empty credentials");
    expect(prompt).toContain("Edge cases, error messages");
  });

  it("includes the diff block", () => {
    const brief = buildDynamicBrief({
      summary: "Test",
      intent: "Test",
      focus: "Test",
    });
    const prompt = assembleReviewerPrompt(brief, target, sampleDiff);
    expect(prompt).toContain("```diff");
    expect(prompt).toContain(sampleDiff);
  });

  it("includes custom instructions for custom targets", () => {
    const customTarget: ReviewTarget = {
      type: "custom",
      instructions: "Review the overall architecture",
    };
    const brief = buildDynamicBrief({
      summary: "Architecture review",
      intent: "Check design patterns",
      focus: "Architecture",
    });
    const prompt = assembleReviewerPrompt(brief, customTarget, "");
    expect(prompt).toContain("Review the overall architecture");
  });
});
