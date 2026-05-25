// Capability index — indexes and queries server capabilities.

import type { ServerCapabilities } from "../config/types.ts";
import { getSupportedLspServerActions } from "../tool/tool-specs.ts";
import type { LspManager } from "./manager.ts";

/**
 * Indexes and queries what each server supports.
 */
export interface CapabilityIndex {
  /** Get the list of supported LSP actions for a server's capabilities. */
  getSupportedActions(capabilities: ServerCapabilities | null | undefined): string[];
}

/**
 * Create a CapabilityIndex for a workspace.
 */
export function createCapabilityIndex(_manager: LspManager): CapabilityIndex {
  return {
    getSupportedActions(capabilities) {
      return getSupportedLspServerActions(capabilities);
    },
  };
}
