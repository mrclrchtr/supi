import type { BuildSystemPromptOptions, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { analyzeContext } from "./analysis.ts";
import { registerContextRenderer } from "./renderer.ts";
import { formatTokens } from "./utils.ts";

export default function contextExtension(pi: ExtensionAPI) {
  let cachedOptions: BuildSystemPromptOptions | undefined;

  pi.on("before_agent_start", async (event) => {
    cachedOptions = event.systemPromptOptions;
  });

  pi.on("session_start", async () => {
    cachedOptions = undefined;
  });

  pi.registerCommand("supi-context", {
    description: "Show detailed context usage",
    handler: async (_args, ctx) => {
      const analysis = analyzeContext(ctx, pi, cachedOptions);
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
}
