import type {
  AgentToolResult,
  ExtensionAPI,
  Theme,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { type Component, Text } from "@earendil-works/pi-tui";
import { renderBatchError } from "./background-render.ts";
import { currentRunBatches } from "./batches.ts";
import { RUN_BATCH_OWNER_KEY } from "./result.ts";

/**
 * Render a collection tool result: errors here, everything else through the owner of the
 * addressed batch. Without a known owner, show the model-facing text.
 */
export function renderOwnedResult(pi: ExtensionAPI, renderer: "renderResult" | "renderCancel") {
  return (
    result: AgentToolResult<unknown>,
    options: ToolRenderResultOptions,
    theme: Theme,
    context: { isError?: boolean } = {},
  ): Component => {
    if (context.isError) return renderBatchError(result, theme);
    const details = result.details as Record<string, unknown> | undefined;
    const collection = currentRunBatches(pi)?.collectionFor(
      details?.[RUN_BATCH_OWNER_KEY],
      details?.batchId,
    );
    if (collection) return collection[renderer](result, options, theme, context);
    const text = result.content?.find((part) => part.type === "text")?.text ?? "";
    return new Text(theme.fg("dim", text.slice(0, 2_000)), 0, 0);
  };
}
