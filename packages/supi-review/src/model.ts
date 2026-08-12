import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSelectableModels } from "@mrclrchtr/supi-core/model-selection";
import type { ReviewModelSelection } from "./types.ts";

/** Sentinel that resolves to the model active when an agent review operation starts. */
export const CURRENT_SESSION_REVIEW_MODEL = "current";

/** Build the canonical `provider/modelId` string used throughout the review flow. */
export { toCanonicalModelId } from "@mrclrchtr/supi-core/model-selection";

/**
 * List review models using Pi's scoped model configuration only.
 *
 * If no scoped model patterns are configured, the review picker is intentionally empty.
 */
export function getSelectableReviewModels(
  ctx: Pick<ExtensionContext, "cwd" | "modelRegistry" | "model">,
  /** Optional override for Pi's scoped model patterns; omit to use configured defaults. */
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

/**
 * Resolve the configured model for an agent-driven review.
 *
 * `current` preserves the historical behavior. Explicit canonical model ids
 * must be both available and present in Pi's current scoped model set.
 */
export function resolveAgentReviewModel(
  ctx: Pick<ExtensionContext, "cwd" | "modelRegistry" | "model">,
  configuredModelId: string,
  /** Optional override for Pi's scoped model patterns; omit to use configured defaults. */
  enabledModelPatterns?: string[],
): ReviewModelSelection | undefined {
  const modelId = configuredModelId.trim();
  if (modelId === CURRENT_SESSION_REVIEW_MODEL) {
    return getCurrentReviewModel(ctx);
  }

  const selection = getSelectableReviewModels(
    { cwd: ctx.cwd, modelRegistry: ctx.modelRegistry, model: undefined },
    enabledModelPatterns,
  ).find((candidate) => candidate.canonicalId === modelId);
  if (!selection) return undefined;

  return {
    ...selection,
    isCurrent: ctx.model
      ? `${ctx.model.provider}/${ctx.model.id}` === selection.canonicalId
      : false,
  };
}

/** Resolve one explicit configured Submission Recovery model when it is available. */
export function resolveRecoveryReviewModel(
  ctx: Pick<ExtensionContext, "cwd" | "modelRegistry" | "model">,
  configuredModelId: string,
  /** Optional override for Pi's scoped model patterns; omit to use configured defaults. */
  enabledModelPatterns?: string[],
): ReviewModelSelection | undefined {
  const modelId = configuredModelId.trim();
  if (!modelId || modelId === "disabled" || modelId === CURRENT_SESSION_REVIEW_MODEL) {
    return undefined;
  }
  return resolveAgentReviewModel(ctx, modelId, enabledModelPatterns);
}
