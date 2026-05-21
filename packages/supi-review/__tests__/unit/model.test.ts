import { describe, expect, it } from "vitest";
import { getSelectableReviewModels, toCanonicalModelId } from "../../src/model.ts";

describe("model selection helpers", () => {
  it("formats canonical model ids", () => {
    expect(toCanonicalModelId({ provider: "anthropic", id: "claude-sonnet-4" })).toBe(
      "anthropic/claude-sonnet-4",
    );
  });

  it("lists only scoped models and keeps the current scoped model first", () => {
    const current = {
      provider: "anthropic",
      id: "claude-sonnet-4",
      name: "Claude Sonnet 4",
      reasoning: false,
      contextWindow: 200_000,
    };
    const models = getSelectableReviewModels(
      {
        cwd: "/project",
        model: current,
        modelRegistry: {
          getAvailable: () => [
            {
              provider: "openai",
              id: "gpt-5",
              name: "GPT-5",
              reasoning: false,
              contextWindow: 128_000,
            },
            current,
          ],
        },
      } as never,
      ["claude-*"],
    );

    expect(models.map((model) => model.canonicalId)).toEqual(["anthropic/claude-sonnet-4"]);
    expect(models[0]?.isCurrent).toBe(true);
  });

  it("hides the current model when it is outside the scoped model set", () => {
    const current = {
      provider: "anthropic",
      id: "claude-sonnet-4",
      name: "Claude Sonnet 4",
      reasoning: false,
      contextWindow: 200_000,
    };
    const models = getSelectableReviewModels(
      {
        cwd: "/project",
        model: current,
        modelRegistry: {
          getAvailable: () => [
            {
              provider: "openai",
              id: "gpt-5",
              name: "GPT-5",
              reasoning: false,
              contextWindow: 128_000,
            },
            current,
          ],
        },
      } as never,
      ["gpt-*"],
    );

    expect(models.map((model) => model.canonicalId)).toEqual(["openai/gpt-5"]);
    expect(models.some((model) => model.isCurrent)).toBe(false);
  });

  it("returns no models when no scoped model patterns are configured", () => {
    const models = getSelectableReviewModels(
      {
        cwd: "/project",
        model: undefined,
        modelRegistry: {
          getAvailable: () => [
            {
              provider: "openai",
              id: "gpt-5",
              name: "GPT-5",
              reasoning: false,
              contextWindow: 128_000,
            },
          ],
        },
      } as never,
      [],
    );

    expect(models).toEqual([]);
  });
});
