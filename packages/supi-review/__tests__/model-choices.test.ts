import { describe, expect, it } from "vitest";
import { extractScopedModelPatterns, getReviewModelChoices } from "../model-choices.ts";

const models = [
  {
    provider: "anthropic",
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
  },
  {
    provider: "anthropic",
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
  },
  {
    provider: "openai",
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
  },
];

describe("review model choices", () => {
  it("extracts scoped model patterns from argv", () => {
    expect(
      extractScopedModelPatterns(["node", "pi", "--models", "sonnet:high,gpt-4o-mini"]),
    ).toEqual(["sonnet:high", "gpt-4o-mini"]);
    expect(extractScopedModelPatterns(["node", "pi", "--models=anthropic/*"])).toEqual([
      "anthropic/*",
    ]);
  });

  it("uses the current model scope when --models is present", () => {
    expect(
      getReviewModelChoices(models, {
        argv: ["node", "pi", "--models", "anthropic/*,gpt-4o-mini:low"],
      }),
    ).toEqual(["anthropic/claude-sonnet-4-5", "anthropic/claude-haiku-4-5", "openai/gpt-4o-mini"]);
  });

  it("falls back to persisted enabledModels when no CLI scope is present", () => {
    expect(
      getReviewModelChoices(models, {
        argv: ["node", "pi"],
        settingsPatterns: ["anthropic/*"],
      }),
    ).toEqual(["anthropic/claude-sonnet-4-5", "anthropic/claude-haiku-4-5"]);
  });

  it("returns no explicit choices when neither CLI nor settings define a scope", () => {
    expect(getReviewModelChoices(models, { argv: ["node", "pi"] })).toEqual([]);
  });
});
