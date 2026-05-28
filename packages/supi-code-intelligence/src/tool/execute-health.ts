/**
 * Tool executor for code_health.
 *
 * Reads LSP diagnostics, server status, and git dirty state.
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/api";
import { getSessionLspService, type SessionLspService } from "@mrclrchtr/supi-lsp/api";
import { gatherGitContext } from "../git-context.ts";
import { type HealthData, renderHealthResult } from "../presentation/markdown/health.ts";
import { normalizePath } from "../search-helpers.ts";
import type { CodeIntelResult } from "../types.ts";

export interface CodeHealthToolParams {
  scope?: string;
  refresh?: boolean;
  include?: string[];
  level?: "summary" | "detailed";
}

const DEFAULT_INCLUDE: string[] = ["diagnostics", "servers"];

export async function executeHealthTool(
  params: CodeHealthToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const cwd = ctx.cwd;
  const included = params.include && params.include.length > 0 ? params.include : DEFAULT_INCLUDE;
  const level = params.level ?? "summary";

  const scopeFilter = resolveScope(params.scope, cwd);
  if (scopeFilter === null && params.scope) {
    return {
      content: `**Error:** Scope path not found: \`${params.scope}\``,
      details: undefined,
    };
  }

  const lspState = getSessionLspService(cwd);
  const service = lspState.kind === "ready" ? lspState.service : null;

  const { recovered, lspStatus } = await maybeRecover(service, params.refresh, lspState);

  const diagnostics = await collectDiagnostics(service, included, scopeFilter, cwd);
  const servers = collectServers(service, included);
  const gitContext = included.includes("dirty") ? gatherGitContext(cwd) : null;

  const data: HealthData = {
    lspAvailable: service !== null,
    lspStatus,
    recovered,
    diagnostics,
    servers,
    gitContext,
    scopeFilter: params.scope ? scopeFilter : null,
    level,
  };

  const content = renderHealthResult(data, cwd);
  return {
    content,
    details: {
      type: "health",
      data: {
        lspAvailable: data.lspAvailable,
        lspStatus: data.lspStatus,
        recovered: data.recovered,
        diagnosticFileCount: data.diagnostics.length,
        serverCount: data.servers.length,
      },
    },
  };
}

function resolveScope(scope: string | undefined, cwd: string): string | null {
  if (!scope) return null;
  const resolved = normalizePath(scope, cwd);
  if (!existsSync(resolved)) return null;
  return resolved;
}

async function maybeRecover(
  service: SessionLspService | null,
  refresh: boolean | undefined,
  lspState: ReturnType<typeof getSessionLspService>,
): Promise<{ recovered: boolean; lspStatus: string }> {
  let recovered = false;
  let lspStatus = describeLspState(lspState);

  if (refresh && service) {
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

async function collectDiagnostics(
  service: SessionLspService | null,
  included: string[],
  scopeFilter: string | null,
  cwd: string,
): Promise<HealthData["diagnostics"]> {
  if (!included.includes("diagnostics") || !service) return [];

  if (scopeFilter && existsSync(scopeFilter) && !isDirectory(scopeFilter)) {
    const diags = await service.fileDiagnostics(scopeFilter, 4);
    if (diags && diags.length > 0) {
      return [
        {
          file: scopeFilter,
          errors: diags.filter((d) => (d.severity ?? 1) === 1).length,
          warnings: diags.filter((d) => (d.severity ?? 1) === 2).length,
        },
      ];
    }
    return [];
  }

  const summary = service.getWorkspaceDiagnosticSummary();
  const result: HealthData["diagnostics"] = [];
  for (const entry of summary) {
    const filePath = resolve(cwd, entry.file);
    if (scopeFilter && !isWithinOrEqual(scopeFilter, filePath)) continue;
    result.push({ file: filePath, errors: entry.errors, warnings: entry.warnings });
  }
  return result;
}

function collectServers(
  service: SessionLspService | null,
  included: string[],
): HealthData["servers"] {
  if (!included.includes("servers") || !service) return [];

  return service.getProjectServers().map((s) => ({
    name: s.name,
    root: s.root,
    fileTypes: s.fileTypes,
    status: s.status,
  }));
}

function describeLspState(state: ReturnType<typeof getSessionLspService>): string {
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

function isDirectory(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}
