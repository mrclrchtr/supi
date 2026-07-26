import { describe, expect, it } from "vitest";
import {
  CURRENT_SESSION_REVIEW_MODEL,
  getCurrentReviewModel,
  getSelectableReviewModels,
  resolveAgentReviewModel,
  toCanonicalModelId,
} from "../../src/model.ts";

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

  it("uses the current session model for an agent-driven review", () => {
    const current = {
      provider: "anthropic",
      id: "claude-sonnet-4",
      name: "Claude Sonnet 4",
      reasoning: false,
      contextWindow: 200_000,
    };

    expect(getCurrentReviewModel({ model: current } as never)).toMatchObject({
      canonicalId: "anthropic/claude-sonnet-4",
      model: current,
      isCurrent: true,
    });
    expect(getCurrentReviewModel({ model: undefined })).toBeUndefined();
  });

  it("resolves an explicit agent-review model from the scoped set", () => {
    const current = {
      provider: "anthropic",
      id: "claude-sonnet-4",
      name: "Claude Sonnet 4",
      reasoning: false,
      contextWindow: 200_000,
    };
    const configured = {
      provider: "openai",
      id: "gpt-5",
      name: "GPT-5",
      reasoning: true,
      contextWindow: 128_000,
    };
    const ctx = {
      cwd: "/project",
      model: current,
      modelRegistry: { getAvailable: () => [current, configured] },
    } as never;

    expect(resolveAgentReviewModel(ctx, "openai/gpt-5", ["claude-*", "gpt-*"])).toMatchObject({
      canonicalId: "openai/gpt-5",
      model: configured,
      isCurrent: false,
    });
    expect(resolveAgentReviewModel(ctx, CURRENT_SESSION_REVIEW_MODEL)).toMatchObject({
      canonicalId: "anthropic/claude-sonnet-4",
      model: current,
      isCurrent: true,
    });
  });

  it("resolves an explicit current id from the available registry instance", () => {
    const active = {
      provider: "openai",
      id: "gpt-5",
      name: "Stale active model",
      reasoning: true,
      contextWindow: 128_000,
    };
    const available = { ...active, name: "Available GPT-5" };
    const ctx = {
      cwd: "/project",
      model: active,
      modelRegistry: { getAvailable: () => [available] },
    } as never;

    expect(resolveAgentReviewModel(ctx, "openai/gpt-5", ["gpt-*"])).toMatchObject({
      canonicalId: "openai/gpt-5",
      model: available,
      isCurrent: true,
    });
  });

  it("does not treat an unavailable active model as an explicit candidate", () => {
    const active = {
      provider: "openai",
      id: "gpt-5",
      name: "GPT-5",
      reasoning: true,
      contextWindow: 128_000,
    };
    const ctx = {
      cwd: "/project",
      model: active,
      modelRegistry: { getAvailable: () => [] },
    } as never;

    expect(resolveAgentReviewModel(ctx, "openai/gpt-5", ["gpt-*"])).toBeUndefined();
    expect(resolveAgentReviewModel(ctx, CURRENT_SESSION_REVIEW_MODEL, ["gpt-*"])).toMatchObject({
      canonicalId: "openai/gpt-5",
      model: active,
    });
  });

  it("rejects an explicitly configured model outside the scoped set", () => {
    const configured = {
      provider: "openai",
      id: "gpt-5",
      name: "GPT-5",
      reasoning: true,
      contextWindow: 128_000,
    };

    expect(
      resolveAgentReviewModel(
        {
          cwd: "/project",
          model: undefined,
          modelRegistry: { getAvailable: () => [configured] },
        } as never,
        "openai/gpt-5",
        ["claude-*"],
      ),
    ).toBeUndefined();
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
