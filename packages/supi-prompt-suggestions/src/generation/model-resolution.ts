/** Select the configured suggestion model from PI's scoped model set. */

import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSelectableModels } from "@mrclrchtr/supi-core/model-selection";

/**
 * Find a configured suggestion model without resolving authentication.
 * Request authentication remains owned by PI's model registry.
 */
export function resolveSuggestionModel(
  ctx: Pick<ExtensionContext, "cwd" | "modelRegistry" | "model">,
  modelId: string,
): Model<Api> | undefined {
  return getSelectableModels(ctx).find((selection) => selection.canonicalId === modelId)?.model;
}
