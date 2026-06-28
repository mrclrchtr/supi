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
import { getSelectableModels } from "@mrclrchtr/supi-core/model-selection";

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
 * Finds the model in the scoped set and obtains an API key via
 * `modelRegistry.getApiKeyAndHeaders`.
 *
 * The caller must check for `"disabled"` before invoking — this function
 * assumes a valid, non-disabled model ID.
 */
export async function resolveSuggestionAuth(
  ctx: ExtensionContext,
  modelId: string,
): Promise<AuthResolutionResult> {
  const match = findSuggestionModel(ctx, modelId);
  if (!match) {
    return {
      kind: "error",
      message: `Suggestion model "${modelId}" not in scoped set`,
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
