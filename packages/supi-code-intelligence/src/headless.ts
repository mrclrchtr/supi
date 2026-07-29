import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createSessionCache } from "./app/app.ts";
import { registerLspSessionLifecycle } from "./substrate/lsp/lifecycle.ts";
import { createLspAdapterState } from "./substrate/lsp/state.ts";
import { registerCodeIntelligenceTools } from "./tool/register.ts";
import { CODE_INTELLIGENCE_TOOL_SPECS } from "./tool/specs.ts";

const INSPECTION_TOOL_NAMES = new Set([
  "code_resolve",
  "code_inspect",
  "code_orientation",
  "code_graph",
  "code_find",
  "code_health",
]);

/**
 * Register the managed-child profile: six inspection tools backed by the shared
 * Workspace provider host, without refactors, settings, UI, or overview state.
 */
export default function headlessInspectionProfile(pi: ExtensionAPI): void {
  const sessions = createSessionCache();
  const lspState = createLspAdapterState();
  registerLspSessionLifecycle(pi, lspState, (ctx) => {
    const session = sessions.getOrCreate(ctx.cwd);
    session.attachLspController(lspState.controller);
    session.seedSentinelSnapshot(lspState.sentinelSnapshot);
    session.setProjectTrusted(ctx.isProjectTrusted());
  });
  pi.on("session_shutdown", () => sessions.clear());

  registerCodeIntelligenceTools(
    pi,
    sessions.getOrCreate,
    undefined,
    CODE_INTELLIGENCE_TOOL_SPECS.filter((spec) => INSPECTION_TOOL_NAMES.has(spec.name)),
  );
}
