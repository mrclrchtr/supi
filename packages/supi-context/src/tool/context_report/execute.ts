import type { BuildSystemPromptOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { analyzeContext, analyzeContextPressure } from "../../analysis.ts";
import { buildConciseResult, buildFullResult } from "./result.ts";

type ContextReportExecute = NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>;

/** Build the context_report execute function. */
export function makeContextReportExecute(
  pi: ExtensionAPI,
  getOptions: () => BuildSystemPromptOptions | undefined,
): ContextReportExecute {
  // biome-ignore lint/complexity/useMaxParams: pi tool execute signature
  return async (_toolCallId, params, _signal, _onUpdate, ctx) => {
    const mode = (params as { mode?: string }).mode;
    if (mode !== "full") {
      return buildConciseResult(analyzeContextPressure(ctx));
    }
    return buildFullResult(analyzeContext(ctx, pi, getOptions()));
  };
}
