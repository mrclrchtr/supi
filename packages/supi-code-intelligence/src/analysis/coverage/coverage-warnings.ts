/**
 * Coverage warning evaluation for degraded structural and semantic coverage.
 *
 * Normalizes LSP startup state, Tree-sitter health, and deprecated config keys
 * into a structured warning report consumed by chat warnings, /supi-ci-status,
 * and code_health.
 */

import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { loadSupiConfigForScope } from "@mrclrchtr/supi-core/config";
import { getDeprecatedLspKeys, loadConfig, scanMissingServers } from "@mrclrchtr/supi-lsp/api";

export interface CoverageWarning {
  type: "deprecated-key" | "language-disabled" | "missing-server" | "structural-unavailable";
  message: string;
  language?: string;
  detail?: string;
}

export interface CoverageWarningReport {
  hasWarnings: boolean;
  warnings: CoverageWarning[];
}

export interface CoverageMissingServerSource {
  getMissingServers(): Array<{ name: string; command: string; foundExtensions?: string[] }>;
}

/** Input needed to evaluate coverage. */
export interface CoverageEvalInput {
  deprecatedKeys: ReturnType<typeof getDeprecatedLspKeys>;
  explicitlyDisabledLanguages: string[];
  missingServers: Array<{ name: string; command: string; foundExtensions: string[] }>;
  structuralState: { kind: string; reason?: string };
}

// ── Evaluation ───────────────────────────────────────────────

/**
 * Evaluate the current coverage state and return a structured warning report.
 *
 * Does not handle deduplication or grace period — callers are responsible
 * for managing emission timing through CoverageWarningState.
 */
export function evaluateCoverageWarnings(input: CoverageEvalInput): CoverageWarningReport {
  const warnings: CoverageWarning[] = [];

  // 1. Deprecated keys
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

  // 2. Explicitly disabled languages
  for (const lang of input.explicitlyDisabledLanguages) {
    warnings.push({
      type: "language-disabled",
      language: lang,
      message: `Semantic coverage reduced: "${lang}" servers are disabled via lsp.servers.${lang}.enabled: false`,
    });
  }

  // 3. Missing server binaries
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

  // 4. Structural (Tree-sitter) failure
  if (input.structuralState.kind === "unavailable") {
    warnings.push({
      type: "structural-unavailable",
      message: `Structural coverage unavailable: ${input.structuralState.reason ?? "Tree-sitter initialization failed"}`,
    });
  }

  return { hasWarnings: warnings.length > 0, warnings };
}

// ── Session state (deduplication + grace period) ─────────────

/**
 * Per-session state for managing warning emission timing and deduplication.
 */
export class CoverageWarningState {
  private lastWarningsHash: string | null = null;
  private forceEmitted = false;
  private readonly startedAt: number;

  constructor() {
    this.startedAt = Date.now();
  }

  /**
   * Return warnings that should be emitted to the user now.
   *
   * Deduplication is hash-based rather than once-per-session: if the
   * warning set changes (e.g., a new missing server is detected), the
   * new warnings are emitted. Identical sets are suppressed.
   * - Respects grace period (no warnings before `gracePeriodMs` has elapsed)
   * - An empty report (no warnings) does not consume emission state
   */
  getPendingWarnings(
    report: CoverageWarningReport,
    gracePeriodMs: number = 5_000,
  ): CoverageWarning[] {
    // Grace period: don't emit during initial pending/settling state
    if (Date.now() - this.startedAt < gracePeriodMs) {
      return [];
    }

    if (!report.hasWarnings || report.warnings.length === 0) {
      return [];
    }

    if (this.forceEmitted) return [];

    const nextHash = this.computeHash(report);
    if (nextHash === this.lastWarningsHash) {
      return [];
    }

    this.lastWarningsHash = nextHash;
    return report.warnings;
  }

  /** Check whether a warning has already been emitted this session. */
  get hasEmitted(): boolean {
    return this.lastWarningsHash !== null;
  }

  /** Force the state to consider warnings as already emitted. Useful for testing. */
  markEmitted(): void {
    this.forceEmitted = true;
    this.lastWarningsHash = "emitted";
  }

  /** Reset the session state. */
  reset(): void {
    this.forceEmitted = false;
    this.lastWarningsHash = null;
  }

  private computeHash(report: CoverageWarningReport): string {
    return report.warnings
      .map((w) => `${w.type}:${w.language ?? ""}:${w.message}`)
      .sort((a, b) => a.localeCompare(b))
      .join("|");
  }
}

// ── Runtime state gathering ─────────────────────────────────

/**
 * Gather the coverage evaluation input from current runtime state.
 *
 * Reads deprecated keys from supi-lsp, structural state from the
 * workspace runtime, and explicitly disabled languages / missing server
 * info from the LSP controller or a config-based fallback scan.
 */
export function gatherCoverageEvalInput(
  cwd: string,
  lspController: CoverageMissingServerSource | null,
): CoverageEvalInput {
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

/** Read raw scoped config to find languages with `servers.<lang>.enabled: false`. */
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
    for (const [name, srv] of Object.entries(servers)) {
      if (srv.enabled === false) disabled.add(name);
    }
  }
  return [...disabled].sort();
}
