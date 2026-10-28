import type { CapabilityState } from "@mrclrchtr/supi-code-runtime/api";
import type {
  AutomaticLspPathPolicy,
  ProjectServerInfo,
  WorkspaceLspRuntimeState,
} from "@mrclrchtr/supi-lsp/api";
import type {
  HealthDiagnosticObservation,
  SemanticHealthState,
} from "../../session/health-types.ts";
import {
  type CapabilityWarningMissingServerSource,
  type CapabilityWarningReport,
  evaluateCapabilityWarnings,
  gatherCapabilityWarningInput,
} from "../capability/capability-warnings.ts";
import { collectDiagnostics } from "./diagnostics.ts";
import { deriveWorkspaceSemanticHealthState } from "./semantic-state.ts";

/** Passive status facts. No maintenance, recovery, or document tracking is performed. */
export interface WorkspaceStatusSnapshot {
  readonly workspaceRoot: string;
  readonly servers: readonly ProjectServerInfo[];
  readonly serverInventoryAvailable: boolean;
  readonly diagnostics: HealthDiagnosticObservation;
  readonly capabilities: {
    readonly semantic: SemanticHealthState;
    readonly structural: CapabilityState;
  };
  readonly capabilityWarnings?: CapabilityWarningReport;
}

/** Runtime facts and trusted configuration needed for one passive observation. */
export interface WorkspaceStatusOptions {
  readonly cwd: string;
  readonly lspState: WorkspaceLspRuntimeState;
  readonly semanticState: CapabilityState;
  readonly structuralState: CapabilityState;
  readonly projectTrusted: boolean;
  readonly homeDir?: string;
  readonly lspController?: CapabilityWarningMissingServerSource | null;
  readonly automaticPathPolicy?: AutomaticLspPathPolicy | null;
}

/** Use the same readiness and diagnostic evidence policy as code_health, without refreshing it. */
export async function observeWorkspaceStatus(
  options: WorkspaceStatusOptions,
): Promise<WorkspaceStatusSnapshot> {
  const { cwd, lspState } = options;
  const runtime = lspState.kind === "ready" ? lspState.runtime : null;
  const servers = runtime?.getProjectServers() ?? [];
  const semantic = deriveWorkspaceSemanticHealthState(lspState, options.semanticState, servers);
  const diagnostics = await collectDiagnostics({
    service: semantic.kind === "ready" ? runtime : null,
    evidenceService:
      lspState.kind === "ready" || lspState.kind === "inactive" ? lspState.runtime : null,
    included: ["diagnostics"],
    scope: { kind: "tracked-files", filter: null },
    cwd,
    unavailableReason: semantic.kind === "ready" ? "Diagnostics unavailable" : semantic.reason,
  });
  const warnings = evaluateCapabilityWarnings(
    gatherCapabilityWarningInput(cwd, options.lspController ?? null, {
      projectTrusted: options.projectTrusted,
      homeDir: options.homeDir,
      automaticPathPolicy: options.automaticPathPolicy ?? undefined,
    }),
  );
  return {
    workspaceRoot: cwd,
    servers,
    serverInventoryAvailable: lspState.kind === "ready" || lspState.kind === "disabled",
    diagnostics: {
      ...diagnostics,
      entries: [...diagnostics.entries].sort(
        (a, b) => b.errors - a.errors || b.warnings - a.warnings || a.file.localeCompare(b.file),
      ),
    },
    capabilities: { semantic, structural: options.structuralState },
    capabilityWarnings: warnings.hasWarnings ? warnings : undefined,
  };
}
