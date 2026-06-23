import type { BuildSystemPromptOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { analyzeContext } from "./analysis.ts";
import { loadContextConfig } from "./config.ts";
import { registerContextRenderer } from "./renderer.ts";
import { registerContextSettings } from "./settings-registration.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./tool/guidance.ts";
import { formatTokens } from "./utils.ts";

export default function contextExtension(pi: ExtensionAPI) {
  let cachedOptions: BuildSystemPromptOptions | undefined;

  // Register settings synchronously during factory
  registerContextSettings();

  pi.on("before_agent_start", async (event) => {
    cachedOptions = event.systemPromptOptions;
  });

  pi.on("session_start", async () => {
    cachedOptions = undefined;
  });

  pi.registerCommand("supi-context", {
    description: "Show detailed context usage. Pass 'full' to show all guideline bullets.",
    handler: async (args, ctx) => {
      const full = args.trim() === "full";
      const analysis = analyzeContext(ctx, pi, cachedOptions, full);
      const shortContent = `${formatTokens(analysis.totalTokens ?? 0)} / ${formatTokens(analysis.contextWindow)} tokens`;

      pi.sendMessage({
        customType: "supi-context",
        content: shortContent,
        display: true,
        details: { analysis },
      });
    },
  });

  registerContextRenderer(pi);

  // ── supi_context agent tool (gated on config) ────────────

  if (loadContextConfig(process.cwd()).agentToolEnabled) {
    pi.registerTool({
      name: "supi_context",
      label: "Context Usage",
      description: toolDescription,
      promptSnippet,
      parameters: Type.Object({}),
      promptGuidelines,
      // biome-ignore lint/complexity/useMaxParams: pi tool execute signature
      async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
        const analysis = analyzeContext(ctx, pi, cachedOptions, true);
        return {
          content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }],
          details: undefined,
        };
      },
    });
  }
}
