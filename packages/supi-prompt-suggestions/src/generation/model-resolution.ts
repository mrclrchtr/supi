/**
 * Suggestion model resolution.
 *
 * Resolves the configured suggestion model from the scoped model set
 * and obtains its API key.  Extracted from {@link SuggestionGenerator}
 * for isolated testing.
 *
 * @module
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadSectionConfig } from "@mrclrchtr/supi-core/config";
import { getSelectableModels } from "@mrclrchtr/supi-core/model-selection";
import { CONFIG_SECTION, DEFAULTS } from "../config/config.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ResolvedAuth {
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is pi's canonical type
  model: any;
  apiKey: string;
  headers?: Record<string, string>;
}

export interface AuthResolutionError {
  kind: "error";
  message: string;
}

export type AuthResolutionResult = { kind: "ok"; auth: ResolvedAuth } | AuthResolutionError;

// ── Resolution ─────────────────────────────────────────────────────────────

/**
 * Resolve model + API key for the configured suggestion model.
 *
 * Loads the `promptSuggestions` config section, finds the model in the
 * scoped set, and obtains an API key via `modelRegistry.getApiKeyAndHeaders`.
 *
 * Returns `null` when the configured model is `"disabled"` — callers must
 * check for this before calling.
 */
export async function resolveSuggestionAuth(ctx: ExtensionContext): Promise<AuthResolutionResult> {
  const config = loadSectionConfig(CONFIG_SECTION, ctx.cwd, DEFAULTS);

  const match = findSuggestionModel(ctx, config.model);
  if (!match) {
    return {
      kind: "error",
      message: `Suggestion model "${config.model}" not in scoped set`,
    };
  }

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(match.model);
  if (!auth.ok) {
    return {
      kind: "error",
      message: `No API key configured for ${match.canonicalId}`,
    };
  }

  return {
    kind: "ok",
    auth: { model: match.model, apiKey: auth.apiKey ?? "", headers: auth.headers },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function findSuggestionModel(ctx: ExtensionContext, modelId: string) {
  const models = getSelectableModels(ctx);
  return models.find((m) => m.canonicalId === modelId);
}
