import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const baseDir = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * SuPi Flow — lightweight spec-driven workflow extension.
 *
 * Skills (auto-discovered via resources_discover from skills/):
 *   /skill:supi-flow-brainstorm — or $supi-flow-brainstorm
 *   /skill:supi-flow-plan [ID]
 *   /skill:supi-flow-apply [ID]
 *   /skill:supi-flow-archive [ID]
 *   /skill:supi-flow-slop-detect (hidden, loaded on demand)
 *
 * Commands registered here:
 *   /supi-flow-status — show current flow state
 *   /supi-flow        — list available flow commands
 */
export default function (pi: ExtensionAPI) {
  pi.on("resources_discover", () => ({
    skillPaths: [join(baseDir, "skills")],
  }));
  pi.registerCommand("supi-flow-status", {
    description: "Show current flow workflow state",
    handler: async (_args, ctx) => {
      const ids = collectTicketIds(ctx.sessionManager.getBranch());
      if (ids.length === 0) {
        ctx.ui.notify("No active flow. Start with /skill:supi-flow-brainstorm.", "info");
        return;
      }
      ctx.ui.notify(
        `Active tickets: ${ids.join(", ")}. Use /skill:supi-flow-plan <ID> to continue.`,
        "info",
      );
    },
  });

  pi.registerCommand("supi-flow", {
    description: "List available flow workflow commands",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        "Flow: /skill:supi-flow-brainstorm → /skill:supi-flow-plan → /skill:supi-flow-apply → /skill:supi-flow-archive\n" +
          "  /supi-flow-status — show current state\n" +
          "  /supi-flow        — this help",
        "info",
      );
    },
  });
}

function collectTicketIds(
  entries: Array<{ type: string; message?: { role?: string; content?: unknown } }>,
): string[] {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    if (entry.message?.role !== "user") continue;
    const content = entry.message?.content;
    if (typeof content !== "string") continue;
    for (const m of content.matchAll(/TNDM-\w{6}/g)) ids.add(m[0]);
  }
  return Array.from(ids);
}
