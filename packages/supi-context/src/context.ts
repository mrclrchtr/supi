import type { BuildSystemPromptOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { analyzeContext } from "./analysis.ts";
import { loadContextConfig } from "./config.ts";
import { type ContextReportEntryData, registerContextEntryRenderer } from "./entry-renderer.ts";
import { registerContextSettings } from "./settings-registration.ts";
import { registerContextReportTool } from "./tool/context_report/register.ts";

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

  // ── context_report agent tool (gated on config) ────────────

  if (loadContextConfig(process.cwd()).agentToolEnabled) {
    registerContextReportTool(pi, () => cachedOptions);
  }
}
