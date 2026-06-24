// Configuration for supi-context.
//
// Config shape (in supi shared config, "context" section):
// {
//   "agentToolEnabled": false   // enable the supi_context agent-callable tool
// }

import { loadSupiConfig } from "@mrclrchtr/supi-core/config";

export interface ContextConfig {
  /** Enable the supi_context agent-callable tool. Default: false */
  agentToolEnabled: boolean;
}

export const CONTEXT_DEFAULTS: ContextConfig = {
  agentToolEnabled: false,
};

/** Load merged supi-context config for the given working directory. */
export function loadContextConfig(cwd: string, homeDir?: string): ContextConfig {
  return loadSupiConfig("context", cwd, CONTEXT_DEFAULTS, { homeDir });
}
