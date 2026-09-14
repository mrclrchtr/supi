import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSuggestionModel } from "../../src/generation/model-resolution.ts";

const MODEL: Model<Api> = {
  id: "suggestion-model",
  name: "Suggestion model",
  api: "openai-completions",
  provider: "test-provider",
  baseUrl: "https://provider.example/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 256,
};

const tempDirectories: string[] = [];

function makeSelectionContext(enabledModels: string[]) {
  const cwd = mkdtempSync(join(tmpdir(), "supi-prompt-selection-"));
  tempDirectories.push(cwd);
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  writeFileSync(
    join(cwd, ".pi", "settings.json"),
    `${JSON.stringify({ enabledModels }, null, 2)}\n`,
  );

  const getApiKeyAndHeaders = vi.fn();
  const ctx = makeCtx({
    cwd,
    model: MODEL,
    modelRegistry: {
      getAvailable: () => [MODEL],
      getApiKeyAndHeaders,
    },
    sessionManager: { getSessionId: () => "pi-session" },
  }) as unknown as ExtensionContext;
  return { ctx, getApiKeyAndHeaders };
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("resolveSuggestionModel", () => {
  it("returns the configured model from the scoped model set", () => {
    const { ctx } = makeSelectionContext(["test-provider/suggestion-model"]);

    expect(resolveSuggestionModel(ctx, "test-provider/suggestion-model")).toBe(MODEL);
  });

  it("does not perform an authentication preflight", () => {
    const { ctx, getApiKeyAndHeaders } = makeSelectionContext(["test-provider/suggestion-model"]);

    resolveSuggestionModel(ctx, "test-provider/suggestion-model");

    expect(getApiKeyAndHeaders).not.toHaveBeenCalled();
  });

  it("returns undefined when the model is outside the scoped set", () => {
    const { ctx } = makeSelectionContext(["other-provider/other-model"]);

    expect(resolveSuggestionModel(ctx, "test-provider/suggestion-model")).toBeUndefined();
  });
});
