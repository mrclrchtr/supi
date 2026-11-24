import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createSessionCache, registerInstructionDedup } from "./app/app.ts";
import { registerGradleObservations } from "./gradle/consent.ts";
import { registerLspSessionLifecycle } from "./substrate/lsp/lifecycle.ts";
import { createLspAdapterState } from "./substrate/lsp/state.ts";
import { registerCodeIntelligenceTools } from "./tool/register.ts";
import { CODE_INTELLIGENCE_TOOL_SPECS } from "./tool/specs.ts";

/** Exact Code Intelligence tool surface available to managed Reviewer Sessions. */
export const HEADLESS_INSPECTION_TOOL_NAMES = [
  "code_resolve",
  "code_inspect",
  "code_orientation",
  "code_graph",
  "code_find",
  "code_health",
] as const;

const inspectionToolNames = new Set<string>(HEADLESS_INSPECTION_TOOL_NAMES);

/** Options for {@link createHeadlessInspectionProfile}. */
export interface HeadlessInspectionProfileOptions {
  /**
   * Workspace-relative instruction files the managed child already received in full, for example
   * embedded in its first prompt. Directory `code_orientation` names them as already supplied
   * instead of delivering truncated copies.
   */
  readonly knownInstructionPaths?: readonly string[];
}

/**
 * Build the managed-child profile: six inspection tools backed by the shared Workspace provider
 * host and instruction deduplication, without refactors, settings, UI, or overview state.
 */
export function createHeadlessInspectionProfile(
  options: HeadlessInspectionProfileOptions = {},
): (pi: ExtensionAPI) => void {
  const knownInstructionFiles = (options.knownInstructionPaths ?? []).map((path) => ({ path }));
  return (pi) => {
    const sessions = createSessionCache();
    const lspState = createLspAdapterState();
    const gradle = registerGradleObservations(pi, { interactive: false });
    registerLspSessionLifecycle(pi, lspState, (ctx) => {
      const session = sessions.getOrCreate(ctx.cwd);
      session.attachLspController(lspState.controller);
      session.seedSentinelSnapshot(lspState.sentinelSnapshot);
      session.setProjectTrusted(ctx.isProjectTrusted());
      session.setGradleObserver(gradle.forContext(ctx));
      session.setAutomaticPathPolicy(lspState.providerLease?.automaticPathPolicy ?? null);
    });
    registerInstructionDedup(pi, sessions.getOrCreate);
    if (knownInstructionFiles.length > 0) {
      pi.on("before_agent_start", (_event, ctx) => {
        sessions.getOrCreate(ctx.cwd).captureNativeInstructionPaths(knownInstructionFiles);
      });
    }
    pi.on("session_shutdown", () => sessions.clear());

    registerCodeIntelligenceTools(
      pi,
      sessions.getOrCreate,
      undefined,
      CODE_INTELLIGENCE_TOOL_SPECS.filter((spec) => inspectionToolNames.has(spec.name)),
    );
  };
}

/** Managed-child profile without known instruction files. */
const headlessInspectionProfile: (pi: ExtensionAPI) => void = createHeadlessInspectionProfile();
export default headlessInspectionProfile;
