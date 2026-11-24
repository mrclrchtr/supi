import {
  createIsolatedAgentResources,
  type IsolatedAgentResources,
} from "@mrclrchtr/supi-agent-runtime/api";
import headlessInspectionProfile from "@mrclrchtr/supi-code-intelligence/headless";
import type { ChildWebToolProvision } from "@mrclrchtr/supi-core/session";

/** Optional Reviewer Extension Set settings for one isolated child. */
export interface IsolatedChildResourceOptions {
  headlessInspection?: boolean;
  /** Load Pi codemode only for an explicitly opted-in Reviewer. */
  codemode?: boolean;
  /** Session-provided Web tools for Reviewer Web Access; omitted means none. */
  webTools?: ChildWebToolProvision;
  projectTrusted?: boolean;
}

/**
 * Build Reviewer or Planner resources through the shared isolated Agent Run builder, with the
 * package-owned protocol as the complete system prompt and no instruction files.
 */
export function createIsolatedChildResources(
  cwd: string,
  protocolPrompt: string,
  agentDir: string,
  options: IsolatedChildResourceOptions = {},
): IsolatedAgentResources {
  return createIsolatedAgentResources({
    cwd,
    agentDir,
    projectTrusted: options.projectTrusted ?? false,
    systemPrompt: protocolPrompt,
    ...(options.codemode ? { codemode: true } : {}),
    ...(options.webTools
      ? { webTools: { provision: options.webTools, toolNames: options.webTools.toolNames } }
      : {}),
    extensions: options.headlessInspection
      ? [{ name: "supi-code-intelligence-headless", factory: headlessInspectionProfile }]
      : [],
  });
}
