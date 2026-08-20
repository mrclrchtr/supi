import type { BuildSystemPromptOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { analyzeContext, analyzeContextPressure } from "../../analysis.ts";
import { type ContextToolDetails, serializeFullContextAnalysis } from "./result.ts";

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
      const snapshot = analyzeContextPressure(ctx);
      return {
        content: [{ type: "text", text: JSON.stringify(snapshot) }],
        details: { mode: "concise", snapshot } satisfies ContextToolDetails,
      };
    }

    const analysis = analyzeContext(ctx, pi, getOptions());
    return {
      content: [{ type: "text", text: await serializeFullContextAnalysis(analysis) }],
      details: { mode: "full", analysis } satisfies ContextToolDetails,
    };
  };
}
