import type { BuildSystemPromptOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";
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
}
