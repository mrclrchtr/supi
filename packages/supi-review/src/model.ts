import type { Model } from "@earendil-works/pi-ai";
import { type ExtensionContext, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { ReviewModelSelection } from "./types.ts";

/** Build the canonical `provider/modelId` string used throughout the review flow. */
export function toCanonicalModelId(
  model: Pick<NonNullable<ExtensionContext["model"]>, "provider" | "id">,
): string {
  return `${model.provider}/${model.id}`;
}

/**
 * List review models using Pi's scoped model configuration only.
 *
 * If no scoped model patterns are configured, the review picker is intentionally empty.
 */
export function getSelectableReviewModels(
  ctx: Pick<ExtensionContext, "cwd" | "modelRegistry" | "model">,
  enabledModelPatterns = SettingsManager.create(ctx.cwd).getEnabledModels(),
): ReviewModelSelection[] {
  if (!enabledModelPatterns || enabledModelPatterns.length === 0) {
    return [];
  }

  const byCanonicalId = new Map<string, ReviewModelSelection>();
  const availableModels = filterByEnabledModels(
    enabledModelPatterns,
    ctx.modelRegistry.getAvailable(),
  );

  const addModel = (
    // biome-ignore lint/suspicious/noExplicitAny: Model<any> is pi's canonical type
    model: Model<any>,
    isCurrent: boolean,
  ) => {
    const canonicalId = toCanonicalModelId(model);
    const existing = byCanonicalId.get(canonicalId);
    if (existing) {
      if (isCurrent) existing.isCurrent = true;
      return;
    }

    byCanonicalId.set(canonicalId, {
      canonicalId,
      provider: model.provider,
      id: model.id,
      model,
      label: model.name ?? canonicalId,
      description: canonicalId,
      isCurrent,
    });
  };

  if (ctx.model && matchModelPatterns(ctx.model, enabledModelPatterns)) {
    addModel(ctx.model, true);
  }

  for (const model of availableModels) {
    addModel(
      model,
      ctx.model ? toCanonicalModelId(model) === toCanonicalModelId(ctx.model) : false,
    );
  }

  return Array.from(byCanonicalId.values()).sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return a.canonicalId.localeCompare(b.canonicalId);
  });
}

function filterByEnabledModels<T extends { provider: string; id: string }>(
  patterns: string[],
  models: T[],
): T[] {
  return models.filter((model) => matchModelPatterns(model, patterns));
}

function matchModelPatterns(model: { provider: string; id: string }, patterns: string[]): boolean {
  return patterns.some((pattern) => matchModelPattern(model, pattern));
}

function matchModelPattern(model: { provider: string; id: string }, pattern: string): boolean {
  const canonicalId = `${model.provider}/${model.id}`;
  if (pattern.includes("/")) {
    return simpleGlobMatch(canonicalId, pattern);
  }
  return simpleGlobMatch(model.id, pattern) || simpleGlobMatch(canonicalId, pattern);
}

function simpleGlobMatch(text: string, pattern: string): boolean {
  if (!pattern.includes("*") && !pattern.includes("?")) {
    return text.toLowerCase() === pattern.toLowerCase();
  }

  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regex}$`, "i").test(text);
}
