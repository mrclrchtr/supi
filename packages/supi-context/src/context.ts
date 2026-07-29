import { StringEnum } from "@earendil-works/pi-ai";
import type { BuildSystemPromptOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { analyzeContext, analyzeContextPressure } from "./analysis.ts";
import { loadContextConfig } from "./config.ts";
import { type ContextReportEntryData, registerContextEntryRenderer } from "./entry-renderer.ts";
import { registerContextSettings } from "./settings-registration.ts";
import { promptSnippet, toolDescription } from "./tool/guidance.ts";
import { serializeFullContextAnalysis } from "./tool/output.ts";
import {
  type ContextToolDetails,
  renderContextToolCall,
  renderContextToolResult,
} from "./tool/render.ts";

const contextToolParameters = Type.Object({
  mode: Type.Optional(
    StringEnum(["concise", "full"] as const, {
      description: "Omit for concise capacity data, or use full for the diagnostic report.",
    }),
  ),
});

export default function contextExtension(pi: ExtensionAPI) {
  let cachedOptions: BuildSystemPromptOptions | undefined;
  let commandRegistered = false;

  // Register settings synchronously during factory.
  registerContextSettings(pi);
  registerContextEntryRenderer(pi);

  pi.on("before_agent_start", async (event) => {
    cachedOptions = event.systemPromptOptions;
  });

  pi.on("session_start", async (_event, ctx) => {
    cachedOptions = undefined;
    if (ctx.mode !== "tui" || commandRegistered) return;

    commandRegistered = true;
    pi.registerCommand("supi-context", {
      description: "Show detailed context usage. Pass 'full' to show all guideline bullets.",
      handler: async (args, commandCtx) => {
        const mode = args.trim() === "full" ? "full" : "preview";
        const analysis = analyzeContext(commandCtx, pi, cachedOptions);
        pi.appendEntry<ContextReportEntryData>("supi-context", { mode, analysis });
      },
    });
  });

  // ── supi_context agent tool (gated on config) ────────────

  if (loadContextConfig(process.cwd()).agentToolEnabled) {
    pi.registerTool({
      name: "supi_context",
      label: "Context Usage",
      description: toolDescription,
      promptSnippet,
      parameters: contextToolParameters,
      renderCall: renderContextToolCall,
      renderResult: renderContextToolResult,
      // biome-ignore lint/complexity/useMaxParams: pi tool execute signature
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        if (params.mode !== "full") {
          const snapshot = analyzeContextPressure(ctx);
          return {
            content: [{ type: "text", text: JSON.stringify(snapshot) }],
            details: { mode: "concise", snapshot } satisfies ContextToolDetails,
          };
        }

        const analysis = analyzeContext(ctx, pi, cachedOptions);
        return {
          content: [{ type: "text", text: await serializeFullContextAnalysis(analysis) }],
          details: { mode: "full", analysis } satisfies ContextToolDetails,
        };
      },
    });
  }
}
