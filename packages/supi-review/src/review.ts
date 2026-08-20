import { type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";
import { Box } from "@earendil-works/pi-tui";
import { LocalReviewAuditStore } from "./audit/local-review-audit-store.ts";
import { registerReviewSettings, syncReviewAgentTools } from "./config.ts";
import { ReviewArtifactStore } from "./session/review-artifact-store.ts";
import { registerReviewAuditTool } from "./tool/review_audit/register.ts";
import { registerReviewOutputTool } from "./tool/review_output/register.ts";
import { registerReviewRunTool } from "./tool/review_run/register.ts";
import { runReviewCommand } from "./tui/review-command.ts";
import { renderRunResult } from "./tui/run.ts";
import { registerReviewWorkspaceCleanupCommand } from "./workspace/cleanup-command.ts";

/** Register the interactive and agent-owned Review surfaces. */
export default function reviewExtension(pi: ExtensionAPI): void {
  const artifactStore = new ReviewArtifactStore();
  const auditStore = new LocalReviewAuditStore({
    agentDir: process.env.PI_CODING_AGENT_DIR || getAgentDir(),
  });
  registerReviewSettings(pi);
  registerReviewOutputTool(pi, artifactStore);
  registerReviewRunTool(pi, artifactStore, auditStore);
  registerReviewAuditTool(pi, auditStore);
  pi.on("session_start", (_event, ctx) => syncReviewAgentTools(pi, ctx.cwd));
  registerReviewWorkspaceCleanupCommand(pi);

  pi.registerMessageRenderer("supi-review", (message, options, theme) => {
    const result = renderRunResult(
      {
        content: [{ type: "text" as const, text: message.content as string }],
        details: message.details,
      },
      { ...options, isPartial: false },
      theme,
    );
    const box = new Box(options.outputPad, 0, undefined);
    box.addChild(result);
    return box;
  });

  pi.registerCommand("supi-review", {
    description: "Run one or more caller-defined Inspection-only review tasks",
    handler: async (_args, ctx) => runReviewCommand(ctx, { pi, artifactStore, auditStore }),
  });
}
