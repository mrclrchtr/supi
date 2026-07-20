/**
 * Capability Warning evaluation for reduced semantic and structural analysis.
 *
 * Normalizes LSP startup state, Tree-sitter health, and deprecated config keys
 * into a structured report consumed by the startup notice, /supi-ci-status,
 * and code_health.
 */

import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { loadSupiConfigForScope } from "@mrclrchtr/supi-core/config";
import { getDeprecatedLspKeys, loadConfig, scanMissingServers } from "@mrclrchtr/supi-lsp/api";

/** One actionable warning about reduced Code intelligence capability. */
export interface CapabilityWarning {
  type: "deprecated-key" | "language-disabled" | "missing-server" | "structural-unavailable";
  message: string;
  language?: string;
  detail?: string;
}

/** Current Capability Warnings and their aggregate presence flag. */
export interface CapabilityWarningReport {
  hasWarnings: boolean;
  warnings: CapabilityWarning[];
}

/** Minimal LSP-controller surface needed to discover missing servers. */
export interface CapabilityWarningMissingServerSource {
  getMissingServers(): Array<{ name: string; command: string; foundExtensions?: string[] }>;
}

/** Current runtime/config facts needed to evaluate Capability Warnings. */
export interface CapabilityWarningInput {
  deprecatedKeys: ReturnType<typeof getDeprecatedLspKeys>;
  explicitlyDisabledLanguages: string[];
  missingServers: Array<{ name: string; command: string; foundExtensions: string[] }>;
  structuralState: { kind: string; reason?: string };
}

/** Evaluate current capability/configuration facts into a structured warning report. */
export function evaluateCapabilityWarnings(input: CapabilityWarningInput): CapabilityWarningReport {
  const warnings: CapabilityWarning[] = [];

  if (input.deprecatedKeys.projectEnabled || input.deprecatedKeys.globalEnabled) {
    warnings.push({
      type: "deprecated-key",
      message:
        "lsp.enabled is deprecated and ignored. Use lsp.servers.<language>.enabled: false for per-language disable.",
    });
  }
  if (input.deprecatedKeys.projectActive || input.deprecatedKeys.globalActive) {
    warnings.push({
      type: "deprecated-key",
      message:
        "lsp.active is deprecated and ignored. All detected servers are attempted unless explicitly disabled.",
    });
  }

  for (const language of input.explicitlyDisabledLanguages) {
    warnings.push({
      type: "language-disabled",
      language,
      message: `Semantic capability reduced: "${language}" servers are disabled via lsp.servers.${language}.enabled: false`,
    });
  }

  for (const server of input.missingServers) {
    warnings.push({
      type: "missing-server",
      language: server.name,
      message: `Cannot start "${server.name}" server — "${server.command}" not found on PATH`,
      detail:
        server.foundExtensions.length > 0
          ? `Affected file types: ${server.foundExtensions.join(", ")}`
          : undefined,
    });
  }

  if (input.structuralState.kind === "unavailable") {
    warnings.push({
      type: "structural-unavailable",
      message: `Structural capability unavailable: ${input.structuralState.reason ?? "Tree-sitter initialization failed"}`,
    });
  }

  return { hasWarnings: warnings.length > 0, warnings };
}

/** Per-session state for warning grace-period timing and deduplication. */
export class CapabilityWarningState {
  private lastWarningsHash: string | null = null;
  private forceEmitted = false;
  private readonly startedAt = Date.now();

  /**
   * Return warnings that should be emitted now.
   *
   * Changed warning sets may emit again; identical sets are suppressed. Empty
   * reports do not consume emission state, and startup honors a grace period.
   */
  getPendingWarnings(
    report: CapabilityWarningReport,
    gracePeriodMs: number = 5_000,
  ): CapabilityWarning[] {
    if (Date.now() - this.startedAt < gracePeriodMs) return [];
    if (!report.hasWarnings || report.warnings.length === 0) return [];
    if (this.forceEmitted) return [];

    const nextHash = this.computeHash(report);
    if (nextHash === this.lastWarningsHash) return [];

    this.lastWarningsHash = nextHash;
    return report.warnings;
  }

  /** Whether any warning set has been emitted in this session. */
  get hasEmitted(): boolean {
    return this.lastWarningsHash !== null;
  }

  /** Force warnings to be considered emitted. Useful for tests. */
  markEmitted(): void {
    this.forceEmitted = true;
    this.lastWarningsHash = "emitted";
  }

  /** Reset warning emission state. */
  reset(): void {
    this.forceEmitted = false;
    this.lastWarningsHash = null;
  }

  private computeHash(report: CapabilityWarningReport): string {
    return report.warnings
      .map((warning) => `${warning.type}:${warning.language ?? ""}:${warning.message}`)
      .sort((left, right) => left.localeCompare(right))
      .join("|");
  }
}

/** Gather current runtime/config facts for Capability Warning evaluation. */
export function gatherCapabilityWarningInput(
  cwd: string,
  lspController: CapabilityWarningMissingServerSource | null,
): CapabilityWarningInput {
  const deprecatedKeys = getDeprecatedLspKeys(cwd);
  const structuralState = getDefaultWorkspaceRuntime().getWorkspace(cwd).structural.state;
  const explicitlyDisabledLanguages = detectExplicitlyDisabledLanguages(cwd);
  const missingServers = lspController
    ? normalizeMissingServers(lspController.getMissingServers())
    : scanMissingServers(loadConfig(cwd), cwd);

  return {
    deprecatedKeys,
    explicitlyDisabledLanguages,
    missingServers,
    structuralState,
  };
}

function normalizeMissingServers(
  raw: Array<{ name: string; command: string; foundExtensions?: string[] }>,
): Array<{ name: string; command: string; foundExtensions: string[] }> {
  return raw.map((entry) => ({
    name: entry.name,
    command: entry.command,
    foundExtensions: entry.foundExtensions ?? [],
  }));
}

function detectExplicitlyDisabledLanguages(cwd: string): string[] {
  const disabled = new Set<string>();
  for (const scope of ["project", "global"] as const) {
    const raw = loadSupiConfigForScope(
      "lsp",
      cwd,
      { servers: {} as Record<string, { enabled?: boolean }> },
      { scope },
    );
    const servers = (raw as { servers?: Record<string, { enabled?: boolean }> }).servers;
    if (!servers) continue;
    for (const [name, server] of Object.entries(servers)) {
      if (server.enabled === false) disabled.add(name);
    }
  }
  return [...disabled].sort();
}
