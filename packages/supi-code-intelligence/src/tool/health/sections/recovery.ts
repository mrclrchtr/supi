// Recovery, state description, and evidence helpers for code_health.
// Extracted from orchestrate.ts.

import type { AgentToolUpdateCallback } from "@earendil-works/pi-coding-agent";
import type { CapabilityState } from "@mrclrchtr/supi-code-runtime/api";
import type { SessionLspService, SessionLspServiceState } from "@mrclrchtr/supi-lsp/api";
import { createEvidenceList, type EvidenceListMetadata } from "../../../analysis/evidence.ts";
import type { GitContext } from "../../../analysis/signals/git.ts";
import { emitToolProgress } from "../../infra/progress.ts";

// ── Recovery ──────────────────────────────────────────────────────────

interface RecoverOptions {
  service: SessionLspService | null;
  refresh: boolean | undefined;
  lspState: SessionLspServiceState;
  semanticStateKind?: "pending" | "ready" | "inactive" | "disabled" | "unavailable";
  onUpdate?: AgentToolUpdateCallback;
}

export async function maybeRecover(
  opts: RecoverOptions,
): Promise<{ recovered: boolean; lspStatus: string }> {
  const { service, refresh, lspState, semanticStateKind, onUpdate } = opts;
  let recovered = false;
  let lspStatus = semanticStateKind === "pending" ? "warming…" : describeLspState(lspState);

  if (refresh && service) {
    emitToolProgress(onUpdate, "code_health: refreshing diagnostics (may restart LSP)...");
    try {
      await service.recoverDiagnostics({ restartIfStillStale: true });
      recovered = true;
      lspStatus = "ready (recovered)";
    } catch {
      // Recovery failed but we continue
    }
  }

  return { recovered, lspStatus };
}

// ── Evidence lists ────────────────────────────────────────────────────

export function buildHealthEvidenceLists(gitContext: GitContext | null): EvidenceListMetadata[] {
  if (!gitContext) return [];
  return [
    createEvidenceList({
      key: "health.dirtyFiles",
      items: gitContext.dirtyFiles,
      maxResults: 5,
    }).metadata,
  ];
}

// ── State description helpers ─────────────────────────────────────────

export function describeLspState(state: SessionLspServiceState): string {
  switch (state.kind) {
    case "ready":
      return "ready";
    case "pending":
      return "starting…";
    case "inactive":
      return "inactive on current session branch";
    case "disabled":
      return "disabled by configuration";
    case "unavailable":
      return `unavailable — ${state.reason}`;
    default:
      return "unknown state";
  }
}

export function describeStructuralState(state: CapabilityState): string {
  switch (state.kind) {
    case "ready":
      return "ready";
    case "pending":
      return "starting…";
    case "inactive":
      return "inactive";
    case "disabled":
      return "disabled by configuration";
    case "unavailable":
      return `unavailable — ${state.reason}`;
    default:
      return "unknown state";
  }
}
