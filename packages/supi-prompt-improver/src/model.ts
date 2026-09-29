import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSelectableModels } from "@mrclrchtr/supi-core/model-selection";

/** Resolve the configured model only when it is both enabled and available. */
export function resolvePromptImproverModel(
  ctx: Pick<ExtensionContext, "cwd" | "modelRegistry" | "model">,
  modelId: string,
): Model<Api> | undefined {
  const selection = getSelectableModels(ctx).find((candidate) => candidate.canonicalId === modelId);
  if (!selection) return undefined;
  return ctx.modelRegistry
    .getAvailable()
    .find((model) => model.provider === selection.provider && model.id === selection.id);
}
