import {
  getSessionLspService,
  type SessionLspService,
  type SessionLspServiceState,
  waitForSessionLspService,
} from "@mrclrchtr/supi-lsp/api";

export interface SemanticProviderOptions {
  waitForReady?: boolean;
  timeoutMs?: number;
}

export const DEFAULT_SEMANTIC_WAIT_MS = 250;

/** Acquire the current session-scoped LSP service, optionally waiting for startup. */
export async function getSemanticService(
  cwd: string,
  options: SemanticProviderOptions = {},
): Promise<SessionLspService | null> {
  const state = await getSemanticServiceState(cwd, options);
  return state.kind === "ready" ? state.service : null;
}

/** Read the current LSP service state with an optional short wait for readiness. */
export async function getSemanticServiceState(
  cwd: string,
  options: SemanticProviderOptions = {},
): Promise<SessionLspServiceState> {
  const current = getSessionLspService(cwd);
  if (!options.waitForReady || current.kind !== "pending") {
    return current;
  }
  return waitForSessionLspService(cwd, options.timeoutMs ?? DEFAULT_SEMANTIC_WAIT_MS);
}
