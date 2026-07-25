import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSelectableModels } from "@mrclrchtr/supi-core/model-selection";
import type { ReviewModelSelection } from "./types.ts";

/** Build the canonical `provider/modelId` string used throughout the review flow. */
export { toCanonicalModelId } from "@mrclrchtr/supi-core/model-selection";

/**
 * List review models using Pi's scoped model configuration only.
 *
 * If no scoped model patterns are configured, the review picker is intentionally empty.
 */
export function getSelectableReviewModels(
  ctx: Pick<ExtensionContext, "cwd" | "modelRegistry" | "model">,
  enabledModelPatterns?: string[],
): ReviewModelSelection[] {
  return getSelectableModels(ctx, enabledModelPatterns) as ReviewModelSelection[];
}

/** Resolve the current session model for a non-interactive agent-driven review. */
export function getCurrentReviewModel(
  ctx: Pick<ExtensionContext, "model">,
): ReviewModelSelection | undefined {
  const model = ctx.model;
  if (!model) return undefined;

  const canonicalId = `${model.provider}/${model.id}`;
  return {
    canonicalId,
    provider: model.provider,
    id: model.id,
    model,
    label: model.name ?? canonicalId,
    description: canonicalId,
    isCurrent: true,
  };
}
